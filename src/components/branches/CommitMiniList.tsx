import { relativeTime } from "../../lib/format";
import type { CommitSummary } from "../../lib/types";
import ShaChip from "../common/ShaChip";
import { tip } from "../common/Tooltip";

interface CommitMiniListProps {
  commits: CommitSummary[];
  /** Highlight only the first N rows (squash preview window). */
  activeCount?: number;
  /** Renders a "用这条" action per row. */
  onPick?: (commit: CommitSummary) => void;
  emptyLabel: string;
  maxHeight?: number;
}

/**
 * GitLab-flavoured commit list: timeline rail, message first, then the mono
 * short SHA / author / relative time — enough to recognise a commit at a glance.
 */
export default function CommitMiniList({
  commits,
  activeCount,
  onPick,
  emptyLabel,
  maxHeight = 176,
}: CommitMiniListProps) {
  if (commits.length === 0) {
    return <p className="px-3 py-2 text-[11px] text-ink-faint">{emptyLabel}</p>;
  }

  return (
    <div className="relative overflow-y-auto py-1" style={{ maxHeight }}>
      <span aria-hidden className="absolute bottom-2 left-[9px] top-2 w-px bg-line" />
      {commits.map((commit, index) => {
        const dimmed = activeCount !== undefined && index >= activeCount;
        const isFirst = index === 0;
        return (
          <div
            key={commit.sha}
            className={`group relative flex gap-2 px-2 py-1.5 pl-[22px] transition-colors ${
              dimmed ? "opacity-45" : "hover:bg-ink/4"
            }`}
          >
            <span
              aria-hidden
              className={`absolute left-[5.5px] top-[9px] h-[7px] w-[7px] rounded-full border ${
                isFirst
                  ? "border-accent bg-accent"
                  : dimmed
                    ? "border-line-strong bg-panel"
                    : "border-line-strong bg-panel"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] leading-snug text-ink" {...tip(commit.summary)}>
                {commit.summary}
              </p>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-ink-faint">
                <ShaChip sha={commit.sha} className="px-1 py-px" />
                <span className="truncate">{commit.authorName}</span>
                <span className="shrink-0">·</span>
                <span className="shrink-0">{relativeTime(commit.committedAt)}</span>
                {onPick ? (
                  <button
                    type="button"
                    onClick={() => onPick(commit)}
                    className="ml-auto shrink-0 rounded px-1 text-[9.5px] text-ink-faint opacity-0 transition-opacity hover:bg-accent-soft hover:text-accent group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    用这条
                  </button>
                ) : null}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}