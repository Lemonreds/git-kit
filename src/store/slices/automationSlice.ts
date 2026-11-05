import type { StateCreator } from "zustand";

import { t } from "../../i18n";
import type { Workflow, WorkflowStep } from "../../lib/workflows";
import {
  newWorkflowId,
  PRESET_WORKFLOWS,
  readWorkflows,
  saveWorkflows,
  stepNeedsMessage,
  stepNeedsSource,
} from "../../lib/workflows";
import type { AppState } from "../appStore";
import { errorMessage } from "../shared";

export type StepStatus = "wait" | "run" | "done" | "skip" | "failed";

/** Progress of a running workflow; `null` when nothing is executing. */
export interface WorkflowRunState {
  id: string;
  name: string;
  /** Index of the step that is (or last was) running. */
  activeIndex: number;
  statuses: StepStatus[];
  error: string | null;
  startedAt: number;
  /** The sequence ended on a failed step; its statuses stay on screen. */
  done: boolean;
}

export interface AutomationSlice {
  workflows: Workflow[];
  workflowRun: WorkflowRunState | null;
  /** Set by "stop": the engine finishes the current step and aborts after it. */
  workflowStopping: boolean;

  createWorkflow: (data: Omit<Workflow, "id">) => Workflow;
  updateWorkflow: (id: string, data: Omit<Workflow, "id">) => void;
  deleteWorkflow: (id: string) => void;
  /** Adds the missing presets; returns how many were added. */
  restorePresetWorkflows: () => number;
  /** Runs every step in order; resolves false when a step failed. */
  runWorkflow: (id: string) => Promise<boolean>;
  /** Asks the engine to finish the current step and stop. */
  stopWorkflow: () => void;
  /** Clear a finished-with-error run so the list becomes interactive again. */
  clearWorkflowRun: () => void;
}

interface StepOutcome {
  ok: boolean;
  /** Nothing to do (e.g. a commit step with an empty index): not a failure. */
  skip?: boolean;
  error?: string;
}

/**
 * Workflow automation: stored step sequences plus the engine that runs them
 * against the existing store actions. The engine never talks to `git`
 * directly — every step is one of the operations the panels already use, so a
 * failure leaves exactly the state (including a mid-way conflict banner) the
 * user would get from the corresponding dialog.
 */
export const createAutomationSlice: StateCreator<AppState, [], [], AutomationSlice> = (set, get) => {
  const notify = (kind: Parameters<AppState["notify"]>[0], message: string) =>
    get().notify(kind, message);

  const persist = (workflows: Workflow[]) => {
    set({ workflows });
    saveWorkflows(workflows);
  };

  /** The branch every step operates on; loaded on demand (palette start). */
  const currentBranch = async () => {
    const find = () => get().branches.find((branch) => branch.isHead) ?? null;
    const first = find();
    if (first) return first;
    await get().refreshBranches();
    return find();
  };

  /** One step → one store action. Returns whether the workflow may continue. */
  const runStep = async (step: WorkflowStep): Promise<StepOutcome> => {

    switch (step.kind) {
      case "fetch": {
        const ok = await get().fetchAll();
        return { ok };
      }
      case "pull": {
        const current = await currentBranch();
        if (!current) return { ok: false, error: t("workflow.noCurrentBranch") };
        const outcome = await get().pullBranch(
          current.name,
          step.merge === true,
          false,
          step.noVerify === true,
        );
        return { ok: outcome.ok, error: outcome.message };
      }
      case "push": {
        const current = await currentBranch();
        if (!current) return { ok: false, error: t("workflow.noCurrentBranch") };
        const outcome = await get().pushBranch(current.name, false);
        return { ok: outcome.ok, error: outcome.message };
      }
      case "rebase": {
        const current = await currentBranch();
        if (!current) return { ok: false, error: t("workflow.noCurrentBranch") };
        const base = (step.source ?? "").trim() || current.upstream;
        if (!base) return { ok: false, error: t("workflow.noUpstream") };
        const outcome = await get().rebaseBranch(current.name, base);
        return { ok: outcome.ok, error: outcome.message };
      }
      case "merge": {
        const source = (step.source ?? "").trim();
        if (!source) return { ok: false, error: t("workflow.noSource") };
        const outcome = await get().mergeBranch(source, false, step.noVerify === true);
        return { ok: outcome.ok, error: outcome.message };
      }
      case "stash": {
        const ok = await get().stashPush((step.message ?? "").trim(), step.includeUntracked !== false);
        return { ok };
      }
      case "stashPop": {
        if ((get().stashEntries?.length ?? 0) === 0) {
          await get().refreshStashes();
        }
        const entries = get().stashEntries;
        if (!entries || entries.length === 0) return { ok: true, skip: true };
        const outcome = await get().stashPop(entries[0].index);
        return { ok: outcome.ok, error: outcome.message };
      }
      case "commit": {
        const message = (step.message ?? "").trim();
        if (!message) return { ok: false, error: t("workflow.noCommitMessage") };
        await get().refreshChanges();
        const entries = get().changes?.entries ?? [];
        const staged = entries.filter((entry) => entry.staged && !entry.conflicted);
        if (staged.length === 0) return { ok: true, skip: true };
        const ok = await get().commitStaged(message, step.noVerify === true);
        return { ok };
      }
      default:
        return { ok: false, error: t("workflow.unknownStep") };
    }
  };

  return {
    workflows: readWorkflows(),
    workflowRun: null,
    workflowStopping: false,

    createWorkflow(data) {
      const workflow: Workflow = { ...data, id: newWorkflowId() };
      persist([...get().workflows, workflow]);
      return workflow;
    },

    updateWorkflow(id, data) {
      persist(get().workflows.map((item) => (item.id === id ? { ...data, id } : item)));
    },

    deleteWorkflow(id) {
      persist(get().workflows.filter((item) => item.id !== id));
    },

    restorePresetWorkflows() {
      // Unknown presets only, so a user's edited copy is never clobbered.
      const existing = new Set(get().workflows.map((item) => item.id));
      const missing = PRESET_WORKFLOWS.filter((item) => !existing.has(item.id));
      if (missing.length === 0) return 0;
      persist([...get().workflows, ...missing]);
      return missing.length;
    },

    async runWorkflow(id) {
      const state = get();
      if (state.workflowRun && !state.workflowRun.done) {
        notify("info", t("workflow.alreadyRunning"));
        return false;
      }
      const workflow = state.workflows.find((item) => item.id === id);
      if (!workflow) return false;
      const project = state.activeProject;
      if (!project || project.status !== "ok") {
        notify("error", t("workflow.noRepo"));
        return false;
      }
      // An interrupted merge / rebase owns the worktree: running more operations
      // on top of it is how repositories get stuck. Re-read the state first so a
      // merge started outside the app is caught too.
      await get().refreshRepoState();
      const pendingOperation = get().repoState;
      // `repoState` is a snapshot object even when idle (`kind: "none"`), so the
      // check has to look at the kind instead of the reference.
      if (pendingOperation && pendingOperation.kind !== "none") {
        notify("error", t("workflow.blockedByOperation"));
        return false;
      }
      if (workflow.steps.length === 0) {
        notify("error", t("workflow.noSteps"));
        return false;
      }
      // Catch an incomplete step here instead of half-way through the sequence.
      const incomplete = workflow.steps.find((step) => stepNeedsMessage(step) || stepNeedsSource(step));
      if (incomplete) {
        notify(
          "error",
          stepNeedsMessage(incomplete) ? t("workflow.stepNeedsMessage") : t("workflow.stepNeedsSource"),
        );
        return false;
      }

      set({
        workflowStopping: false,
        workflowRun: {
          id,
          name: workflow.name,
          activeIndex: 0,
          statuses: workflow.steps.map(() => "wait"),
          error: null,
          startedAt: Date.now(),
          done: false,
        },
      });

      const mark = (index: number, status: StepStatus) => {
        set((current) => {
          const run = current.workflowRun;
          if (!run || run.id !== id) return current;
          const statuses = run.statuses.slice();
          statuses[index] = status;
          return { workflowRun: { ...run, activeIndex: index, statuses } };
        });
      };

      const projectId = project.id;
      for (let index = 0; index < workflow.steps.length; index += 1) {
        if (get().workflowStopping) {
          mark(index, "skip");
          break;
        }
        // Switching repositories mid-run would aim the remaining steps at the
        // wrong project, so the sequence ends instead.
        if (get().activeProject?.id !== projectId) {
          mark(index, "skip");
          set({ workflowStopping: true });
          break;
        }
        mark(index, "run");
        let outcome: StepOutcome;
        try {
          outcome = await runStep(workflow.steps[index]);
        } catch (error) {
          outcome = { ok: false, error: errorMessage(error) };
        }
        if (!outcome.ok) {
          mark(index, "failed");
          set((current) =>
            current.workflowRun
              ? {
                  workflowRun: {
                    ...current.workflowRun,
                    statuses: current.workflowRun.statuses.map((status, at) =>
                      at > index && status === "wait" ? "skip" : status,
                    ),
                    error: outcome.error ?? t("workflow.stepFailed"),
                    done: true,
                  },
                }
              : current,
          );
          const title = t("workflow.failedTitle", { name: workflow.name });
          if (outcome.error) get().showAlert(title, outcome.error);
          else notify("error", title);
          set({ workflowStopping: false });
          return false;
        }
        mark(index, outcome.skip ? "skip" : "done");
      }

      const stopped = get().workflowStopping;
      set({ workflowStopping: false, workflowRun: null });
      if (stopped) {
        notify("info", t("workflow.stopped", { name: workflow.name }));
        return false;
      }
      notify("success", t("workflow.finished", { name: workflow.name }));
      return true;
    },

    stopWorkflow() {
      const run = get().workflowRun;
      if (!run || run.done) return;
      set({ workflowStopping: true });
    },

    clearWorkflowRun() {
      set({ workflowRun: null, workflowStopping: false });
    },
  };
};