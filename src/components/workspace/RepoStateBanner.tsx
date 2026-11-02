import { AlertTriangle, Ban, Check, SkipForward } from "lucide-react";

import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";

const OP_LABEL: Record<string, MessageKey> = {
  merge: "workspace.opMerge",
  rebase: "workspace.opRebase",
  "cherry-pick": "workspace.opCherryPick",
  revert: "workspace.opRevert",
};

/**
 * Guard rail for repositories stuck in merge / rebase / cherry-pick / revert:
 * shows the stopped operation, the conflicted files and continue / skip / abort.
 */
export default function RepoStateBanner() {
  const t = useT();
  const state = useAppStore((store) => store.repoState);
  const repoOperation = useAppStore((store) => store.repoOperation);

  if (!state || state.kind === "none") return null;

  const hasConflicts = state.conflicts.length > 0;
  const opKey = OP_LABEL[state.kind];

  return (
    <div className="animate-fade flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-[11px]">
      <AlertTriangle size={12} className="shrink-0 text-warning" />
      <span className="font-medium text-ink">
        {opKey ? t(opKey) : state.kind}
        {state.detail ? <span className="ml-1 font-normal text-ink-faint">{state.detail}</span> : null}
      </span>

      {hasConflicts ? (
        <span className="flex min-w-0 flex-wrap items-center gap-1 text-ink-faint">
          ·
          <span className="text-negative">
            {t("workspace.conflictCount", { count: state.conflicts.length })}
          </span>
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
        <span className="text-ink-faint">· {t("workspace.conflictsResolved")}</span>
      )}

      <span className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => void repoOperation("continue")}
          disabled={hasConflicts}
          title={hasConflicts ? t("workspace.continueBlocked") : undefined}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
        >
          <Check size={10} />
          {t("workspace.continue")}
        </button>
        {state.canSkip ? (
          <button
            type="button"
            onClick={() => void repoOperation("skip")}
            className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <SkipForward size={10} />
            {t("workspace.skip")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void repoOperation("abort")}
          className="inline-flex items-center gap-1 rounded-md border border-negative/35 px-1.5 py-0.5 text-[10.5px] text-negative transition-colors hover:bg-negative/8"
        >
          <Ban size={10} />
          {t("workspace.abort")}
        </button>
      </span>
    </div>
  );
}