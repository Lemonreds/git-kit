import { AlertTriangle, Ban, Check, SkipForward } from "lucide-react";

import { useAppStore } from "../../store/appStore";

const LABEL: Record<string, string> = {
  merge: "Merge 进行中",
  rebase: "Rebase 进行中",
  "cherry-pick": "Cherry-pick 进行中",
  revert: "Revert 进行中",
};

/**
 * Guard rail for repositories stuck in merge / rebase / cherry-pick / revert:
 * shows the stopped operation, the conflicted files and continue / skip / abort.
 */
export default function RepoStateBanner() {
  const state = useAppStore((store) => store.repoState);
  const repoOperation = useAppStore((store) => store.repoOperation);

  if (!state || state.kind === "none") return null;

  const hasConflicts = state.conflicts.length > 0;

  return (
    <div className="animate-fade flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-[11px]">
      <AlertTriangle size={12} className="shrink-0 text-warning" />
      <span className="font-medium text-ink">
        {LABEL[state.kind] ?? state.kind}
        {state.detail ? <span className="ml-1 font-normal text-ink-faint">{state.detail}</span> : null}
      </span>

      {hasConflicts ? (
        <span className="flex min-w-0 flex-wrap items-center gap-1 text-ink-faint">
          ·
          <span className="text-negative">{state.conflicts.length} 个冲突</span>
          {state.conflicts.slice(0, 3).map((path) => (
            <code
              key={path}
              className="max-w-[220px] truncate rounded bg-canvas px-1 py-px font-mono text-[10px] text-ink-soft"
            >
              {path}
            </code>
          ))}
          {state.conflicts.length > 3 ? <span>…</span> : null}
        </span>
      ) : (
        <span className="text-ink-faint">· 冲突已解决，可继续</span>
      )}

      <span className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => void repoOperation("continue")}
          disabled={hasConflicts}
          title={hasConflicts ? "先解决冲突并暂存，再继续" : undefined}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
        >
          <Check size={10} />
          继续
        </button>
        {state.canSkip ? (
          <button
            type="button"
            onClick={() => void repoOperation("skip")}
            className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <SkipForward size={10} />
            跳过
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void repoOperation("abort")}
          className="inline-flex items-center gap-1 rounded-md border border-negative/35 px-1.5 py-0.5 text-[10.5px] text-negative transition-colors hover:bg-negative/8"
        >
          <Ban size={10} />
          中止
        </button>
      </span>
    </div>
  );
}