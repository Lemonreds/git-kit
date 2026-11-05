import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleStop,
  GitBranch,
  Loader2,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";

import { useT } from "../../i18n";
import type { WorkflowStep, WorkflowStepKind } from "../../lib/workflows";
import { stepNeedsMessage, stepNeedsSource } from "../../lib/workflows";
import type { Workflow } from "../../lib/workflows";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import type { StepStatus } from "../../store/slices/automationSlice";
import ConfirmDialog from "../common/ConfirmDialog";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import Modal from "../common/Modal";
import PaneTabs from "../workspace/PaneTabs";
import StepPicker from "./StepPicker";

/** Icons per step kind; the same map drives the chips and the editor list. */
const STEP_STYLE: Record<WorkflowStepKind, { tone: string }> = {
  fetch: { tone: "text-ink-faint" },
  pull: { tone: "text-accent" },
  rebase: { tone: "text-warning" },
  merge: { tone: "text-warning" },
  stash: { tone: "text-ink-soft" },
  stashPop: { tone: "text-ink-soft" },
  commit: { tone: "text-positive" },
  push: { tone: "text-positive" },
};

interface EditorProps {
  initial: Workflow | null;
  branches: string[];
  onSave: (data: Omit<Workflow, "id">) => void;
  onClose: () => void;
}

function WorkflowEditor({ initial, branches, onSave, onClose }: EditorProps) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [steps, setSteps] = useState<WorkflowStep[]>(initial?.steps ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const patch = (index: number, next: Partial<WorkflowStep>) => {
    setSteps((current) => current.map((step, at) => (at === index ? { ...step, ...next } : step)));
  };

  const move = (index: number, delta: number) => {
    setSteps((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const addStep = (kind: WorkflowStepKind) => {
    setSteps((current) => [...current, kind === "stash" ? { kind, includeUntracked: true } : { kind }]);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("workflow.nameLabel"));
      return;
    }
    if (steps.length === 0) {
      setError(t("workflow.noSteps"));
      return;
    }
    const invalid = steps.find((step) => stepNeedsMessage(step) || stepNeedsSource(step));
    if (invalid) {
      setError(stepNeedsMessage(invalid) ? t("workflow.stepNeedsMessage") : t("workflow.stepNeedsSource"));
      return;
    }
    onSave({ name: trimmed, description: description.trim(), steps });
  };

  return (
    <Modal
      open
      title={initial ? t("workflow.edit") : t("workflow.create")}
      subtitle={t("workflow.hint")}
      // Esc while the inline step picker is open collapses the picker; the picker
      // stops that keystroke itself, so the editor keeps closing on its own Esc/X.
      onClose={onClose}
      width={680}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("common.save")}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
              {t("workflow.nameLabel")}
            </span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder={t("workflow.namePlaceholder")}
              className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
              {t("workflow.descriptionLabel")}
            </span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("workflow.descriptionPlaceholder")}
              className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
            />
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-[11.5px] font-medium text-ink-soft">
            {t("workflow.stepsLabel")}
          </span>
          {steps.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-3.5 text-center text-[11.5px] text-ink-faint">
              {t("workflow.emptyHint")}
            </p>
          ) : (
            <ol className="space-y-2">
              {steps.map((step, index) => (
                <li
                  key={`${step.kind}-${index}`}
                  className="rounded-xl border border-line bg-canvas/60 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-panel text-[10.5px] font-semibold text-ink-soft">
                      {index + 1}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-[12.5px] font-medium ${STEP_STYLE[step.kind].tone}`}>
                      {t(`workflow.step.${step.kind}`)}
                    </span>
                    <IconButton
                      label={t("workflow.stepUp")}
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={11} />
                    </IconButton>
                    <IconButton
                      label={t("workflow.stepDown")}
                      size="sm"
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={11} />
                    </IconButton>
                    <IconButton
                      label={t("workflow.removeStep")}
                      size="sm"
                      tone="danger"
                      onClick={() => setSteps((current) => current.filter((_, at) => at !== index))}
                    >
                      <X size={11} />
                    </IconButton>
                  </div>

                  {step.kind === "commit" || step.kind === "stash" ? (
                    <input
                      value={step.message ?? ""}
                      onChange={(event) => {
                        patch(index, { message: event.target.value });
                        setError(null);
                      }}
                      placeholder={
                        step.kind === "commit"
                          ? t("workflow.messagePlaceholder")
                          : t("workflow.stashMessagePlaceholder")
                      }
                      className="mt-2 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-[11.5px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
                    />
                  ) : null}

                  {step.kind === "stash" ? (
                    <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-faint">
                      <span
                        className={`grid h-3.5 w-3.5 place-items-center rounded-[4px] border transition-colors ${
                          step.includeUntracked !== false
                            ? "border-accent bg-accent text-white"
                            : "border-line-strong bg-panel"
                        }`}
                      >
                        {step.includeUntracked !== false ? <Check size={9} strokeWidth={3} /> : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={step.includeUntracked !== false}
                        onChange={() => patch(index, { includeUntracked: step.includeUntracked === false })}
                        className="sr-only"
                      />
                      {t("workflow.includeUntracked")}
                    </label>
                  ) : null}

                  {step.kind === "pull" ? (
                    <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-faint">
                      <span
                        className={`grid h-3.5 w-3.5 place-items-center rounded-[4px] border transition-colors ${
                          step.merge ? "border-accent bg-accent text-white" : "border-line-strong bg-panel"
                        }`}
                      >
                        {step.merge ? <Check size={9} strokeWidth={3} /> : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={step.merge === true}
                        onChange={() => patch(index, { merge: !step.merge })}
                        className="sr-only"
                      />
                      {t("workflow.pullMerge")}
                    </label>
                  ) : null}

                  {step.kind === "commit" || step.kind === "pull" || step.kind === "merge" ? (
                    <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-faint">
                      <span
                        className={`grid h-3.5 w-3.5 place-items-center rounded-[4px] border transition-colors ${
                          step.noVerify ? "border-accent bg-accent text-white" : "border-line-strong bg-panel"
                        }`}
                      >
                        {step.noVerify ? <Check size={9} strokeWidth={3} /> : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={step.noVerify === true}
                        onChange={() => patch(index, { noVerify: step.noVerify !== true })}
                        className="sr-only"
                      />
                      {t("workflow.skipHooks")}
                    </label>
                  ) : null}

                  {step.kind === "merge" || step.kind === "rebase" ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="shrink-0 text-[11px] text-ink-faint">
                        {step.kind === "merge"
                          ? t("workflow.sourceLabel")
                          : t("workflow.rebaseSourceLabel")}
                      </span>
                      <input
                        value={step.source ?? ""}
                        onChange={(event) => {
                          patch(index, { source: event.target.value });
                          setError(null);
                        }}
                        list={`wf-branches-${index}`}
                        placeholder={
                          step.kind === "merge"
                            ? t("workflow.sourcePlaceholder")
                            : t("workflow.rebaseSourcePlaceholder")
                        }
                        className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2 py-1.5 text-[11.5px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
                      />
                      <datalist id={`wf-branches-${index}`}>
                        {branches.map((branch) => (
                          <option key={branch} value={branch} />
                        ))}
                      </datalist>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          {pickerOpen ? (
            <div ref={pickerRef} className="mt-2">
              <StepPicker
                onPick={(kind) => {
                  addStep(kind);
                  setError(null);
                  setPickerOpen(false);
                }}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPickerOpen(true);
                // The panel grows below the button, which may sit at the bottom
                // of the scroll area: keep the newly opened picker in view.
                window.setTimeout(
                  () => pickerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
                  0,
                );
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent"
            >
              <Plus size={13} />
              {t("workflow.addStep")}
            </button>
          )}
        </div>

        {error ? <p className="text-[11.5px] text-negative">{error}</p> : null}
      </div>
    </Modal>
  );
}

const STATUS_TONE: Record<StepStatus, string> = {
  wait: "border-line text-ink-faint",
  run: "border-accent/50 bg-accent/10 text-accent",
  done: "border-positive/40 bg-positive/10 text-positive",
  skip: "border-line text-ink-faint line-through",
  failed: "border-negative/50 bg-negative/10 text-negative",
};

export default function WorkflowPanel() {
  const t = useT();
  const { workflows, run, stopping, project, snapshot, changesCount, branches } = useSlice((state) => ({
    workflows: state.workflows,
    run: state.workflowRun,
    stopping: state.workflowStopping,
    project: state.activeProject,
    snapshot: state.snapshot,
    changesCount: state.changes?.entries.length ?? 0,
    branches: state.branches,
  }));

  const createWorkflow = useAppStore((state) => state.createWorkflow);
  const updateWorkflow = useAppStore((state) => state.updateWorkflow);
  const deleteWorkflow = useAppStore((state) => state.deleteWorkflow);
  const restorePresetWorkflows = useAppStore((state) => state.restorePresetWorkflows);
  const setPendingWorkflowRun = useAppStore((state) => state.setPendingWorkflowRun);
  const stopWorkflow = useAppStore((state) => state.stopWorkflow);
  const clearWorkflowRun = useAppStore((state) => state.clearWorkflowRun);
  const notify = useAppStore((state) => state.notify);

  const [editor, setEditor] = useState<{ workflow: Workflow | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Workflow | null>(null);

  const ready = project?.status === "ok";
  const branchNames = branches.filter((branch) => !branch.isRemote).map((branch) => branch.name);
  // A workflow runs on the checked-out branch, which is worth naming: the steps
  // below say "current branch" without ever saying which one that is.
  const headBranch = snapshot?.headBranch ?? project?.headBranch ?? null;
  const currentBranch = headBranch && !headBranch.startsWith("detached@") ? headBranch : null;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-2"
      >
        <PaneTabs active="workflows" changesCount={changesCount} />
        <div className="no-drag ml-auto flex min-w-0 items-center gap-0.5">
          <IconButton
            label={t("workflow.restorePresets")}
            onClick={() => {
              const added = restorePresetWorkflows();
              notify("info", added > 0 ? t("workflow.presetsRestored") : t("workflow.presetsComplete"));
            }}
          >
            <Sparkles size={14} />
          </IconButton>
          <IconButton label={t("workflow.create")} onClick={() => setEditor({ workflow: null })}>
            <Plus size={14} />
          </IconButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {workflows.length === 0 ? (
          <EmptyState icon={WorkflowIcon} title={t("workflow.empty")} description={t("workflow.emptyHint")}>
            <div className="mt-0.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditor({ workflow: null })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <Plus size={12} />
                {t("workflow.create")}
              </button>
              <button
                type="button"
                onClick={() => restorePresetWorkflows()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <Sparkles size={12} />
                {t("workflow.restorePresets")}
              </button>
            </div>
          </EmptyState>
        ) : (
          <ul className="space-y-1 p-1.5">
            {workflows.map((workflow) => {
              const owned = run?.id === workflow.id;
              const active = Boolean(owned && run && !run.done);
              const failedRun = Boolean(owned && run?.done);
              const idle = (!run || run.done) && ready;
              return (
                <li
                  key={workflow.id}
                  className={`rounded-lg border px-2 py-1.5 transition-colors ${
                    active
                      ? "border-accent/40 bg-accent/5"
                      : failedRun
                        ? "border-negative/35 bg-negative/4"
                        : "border-line bg-canvas/30"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-panel text-ink-faint">
                      <WorkflowIcon size={11} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium text-ink" title={workflow.name}>
                        {workflow.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-faint">
                        <span className="shrink-0">
                          {t("workflow.stepCount", { count: workflow.steps.length })}
                        </span>
                        {workflow.description ? (
                          <>
                            <span aria-hidden className="text-line-strong">
                              ·
                            </span>
                            <span className="min-w-0 truncate">{workflow.description}</span>
                          </>
                        ) : null}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {workflow.steps.map((step, index) => {
                          const status: StepStatus | null =
                            owned && run ? run.statuses[index] : null;
                          const tone = status ? STATUS_TONE[status] : "border-line text-ink-soft";
                          return (
                            <span
                              key={`${step.kind}-${index}`}
                              className={`inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9.5px] ${tone}`}
                            >
                              {status === "run" ? (
                                <Loader2 size={8} className="animate-spin" />
                              ) : status === "done" ? (
                                <Check size={8} />
                              ) : (
                                <ChevronRight size={8} />
                              )}
                              {t(`workflow.step.${step.kind}`)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {active ? (
                        <IconButton
                          label={t("workflow.stop")}
                          size="sm"
                          tone="danger"
                          disabled={stopping}
                          onClick={() => stopWorkflow()}
                        >
                          <CircleStop size={12} />
                        </IconButton>
                      ) : failedRun ? (
                        <IconButton
                          label={t("common.close")}
                          size="sm"
                          onClick={() => clearWorkflowRun()}
                        >
                          <X size={12} />
                        </IconButton>
                      ) : (
                        <IconButton
                          label={t("workflow.run")}
                          size="sm"
                          disabled={!idle}
                          onClick={() => setPendingWorkflowRun(workflow.id)}
                        >
                          <Play size={12} />
                        </IconButton>
                      )}
                      <IconButton
                        label={t("workflow.edit")}
                        size="sm"
                        disabled={active}
                        onClick={() => setEditor({ workflow })}
                      >
                        <Pencil size={12} />
                      </IconButton>
                      <IconButton
                        label={t("workflow.delete")}
                        size="sm"
                        tone="danger"
                        disabled={active}
                        onClick={() => setPendingDelete(workflow)}
                      >
                        <Trash2 size={12} />
                      </IconButton>
                    </div>
                  </div>

                  {owned && run?.error ? (
                    <p className="mt-1.5 whitespace-pre-line rounded-md border border-negative/30 bg-negative/8 px-2 py-1 font-mono text-[10px] leading-relaxed text-negative">
                      {run.error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {currentBranch ? (
        <p className="flex shrink-0 items-center gap-1.5 truncate border-t border-line px-3 py-1.5">
          {/* The steps above act on "the current branch" without naming it, so this
              chip is the one place that answers "which branch will run". */}
          <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent">
            <GitBranch size={10} className="shrink-0" />
            <span className="truncate">
              {t("workflow.currentBranch", { branch: currentBranch })}
            </span>
          </span>
        </p>
      ) : null}

      {editor ? (
        <WorkflowEditor
          initial={editor.workflow}
          branches={branchNames}
          onSave={(data) => {
            if (editor.workflow) updateWorkflow(editor.workflow.id, data);
            else createWorkflow(data);
            setEditor(null);
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("workflow.deleteTitle")}
        description={t("workflow.deleteDescription", { name: pendingDelete?.name ?? "" })}
        confirmLabel={t("common.delete")}
        tone="danger"
        onConfirm={() => {
          const workflow = pendingDelete;
          setPendingDelete(null);
          if (workflow) deleteWorkflow(workflow.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}