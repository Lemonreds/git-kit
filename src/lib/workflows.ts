/**
 * User-defined Git command sequences ("workflows").
 *
 * A workflow is a name plus an ordered list of steps. Steps are kept declarative
 * on purpose: no shell strings, no stored callbacks — only the handful of
 * operations the repository layer already exposes, so running a workflow can
 * never do something the UI itself could not do.
 */

export type WorkflowStepKind =
  | "fetch"
  | "pull"
  | "rebase"
  | "merge"
  | "stash"
  | "stashPop"
  | "commit"
  | "push";

export interface WorkflowStep {
  kind: WorkflowStepKind;
  /** Commit message (`commit`) or stash message (`stash`). */
  message?: string;
  /** `pull`: merge instead of rebase. */
  merge?: boolean;
  /** `merge` / `rebase` base ref; empty = the current branch's upstream. */
  source?: string;
  /** `stash`: include untracked files (default true). */
  includeUntracked?: boolean;
  /** `commit` / `pull` (merge) / `merge`: pass `-n`, skipping git hooks. */
  noVerify?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
}

export const STEP_KINDS: WorkflowStepKind[] = [
  "fetch",
  "pull",
  "rebase",
  "merge",
  "stash",
  "stashPop",
  "commit",
  "push",
];

/** Steps that run `git` write operations (used for the "destructive" hint). */
export const WRITE_STEPS: WorkflowStepKind[] = [
  "pull",
  "rebase",
  "merge",
  "stash",
  "stashPop",
  "commit",
  "push",
];

const STORAGE_KEY = "gk.workflows";
const SEEDED_KEY = "gk.workflows.seeded";

export function newWorkflowId(): string {
  return `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** First-run examples. They exist so the pane is not an empty form. */
export const PRESET_WORKFLOWS: Workflow[] = [
  {
    id: "preset:sync",
    name: "同步主干",
    description: "拉取远程（rebase）后推送当前分支",
    steps: [{ kind: "fetch" }, { kind: "pull" }, { kind: "push" }],
  },
  {
    id: "preset:stash-pull",
    name: "暂存后同步",
    description: "把未提交的改动收进 stash，同步远程，再恢复",
    steps: [
      { kind: "stash", message: "workflow: before sync" },
      { kind: "pull" },
      { kind: "stashPop" },
    ],
  },
  {
    id: "preset:commit-push",
    name: "提交并推送",
    description: "提交已暂存的改动，然后推送当前分支",
    steps: [
      { kind: "commit", message: "" },
      { kind: "push" },
    ],
  },
];

/** Rebuild a step from untrusted storage, dropping anything unknown. */
function parseStep(raw: unknown): WorkflowStep | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.kind !== "string") return null;
  if (!STEP_KINDS.includes(value.kind as WorkflowStepKind)) return null;
  const step: WorkflowStep = { kind: value.kind as WorkflowStepKind };
  if (typeof value.message === "string") step.message = value.message;
  if (typeof value.source === "string") step.source = value.source;
  if (typeof value.merge === "boolean") step.merge = value.merge;
  if (typeof value.includeUntracked === "boolean") {
    step.includeUntracked = value.includeUntracked;
  }
  if (typeof value.noVerify === "boolean") step.noVerify = value.noVerify;
  return step;
}

function parseWorkflow(raw: unknown): Workflow | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.name !== "string") return null;
  const steps = Array.isArray(value.steps)
    ? value.steps.map(parseStep).filter((step): step is WorkflowStep => step !== null)
    : [];
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    steps,
  };
}

function write(workflows: Workflow[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
  } catch {
    // Private mode / quota: the list just will not survive a restart.
  }
}

export function saveWorkflows(workflows: Workflow[]): void {
  write(workflows);
  try {
    localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    // ignore
  }
}

/** Stored workflows, seeded with the presets on the very first run. */
export function readWorkflows(): Workflow[] {
  let raw: string | null = null;
  let seeded = false;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    seeded = localStorage.getItem(SEEDED_KEY) === "1";
  } catch {
    return PRESET_WORKFLOWS;
  }
  if (!raw) {
    if (seeded) return [];
    saveWorkflows(PRESET_WORKFLOWS);
    return PRESET_WORKFLOWS;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseWorkflow)
      .filter((workflow): workflow is Workflow => workflow !== null && workflow.steps.length > 0);
  } catch {
    return [];
  }
}

/** True when a step needs the user to fill in a field before it can run. */
export function stepNeedsMessage(step: WorkflowStep): boolean {
  return step.kind === "commit" && !(step.message ?? "").trim();
}

export function stepNeedsSource(step: WorkflowStep): boolean {
  return step.kind === "merge" && !(step.source ?? "").trim();
}