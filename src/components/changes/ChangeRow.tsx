import { EyeOff, Plus, Trash2, Undo2 } from "lucide-react";

import { baseName, dirName, statusMeta } from "../../lib/format";
import type { WorktreeEntry } from "../../lib/types";
import type { FileStatus } from "../../lib/types";
import IconButton from "../common/IconButton";
import { tip } from "../common/Tooltip";

const TONE_CLASS: Record<string, string> = {
  positive: "bg-positive/12 text-positive",
  negative: "bg-negative/12 text-negative",
  accent: "bg-accent/12 text-accent",
  warning: "bg-warning/14 text-warning",
  neutral: "bg-ink/8 text-ink-faint",
};

interface ChangeRowProps {
  entry: WorktreeEntry;
  side: "staged" | "unstaged";
  active: boolean;
  onOpen: () => void;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
  onIgnore?: () => void;
}

export default function ChangeRow({
  entry,
  side,
  active,
  onOpen,
  onStage,
  onUnstage,
  onDiscard,
  onIgnore,
}: ChangeRowProps) {
  const status: FileStatus | null = side === "staged" ? entry.staged : entry.unstaged;
  const meta = statusMeta(status ?? "modified");
  const conflicted = entry.conflicted;

  return (
    <div
      className={`group relative flex items-center rounded-lg transition-colors ${
        active ? "bg-accent-soft" : "hover:bg-ink/5"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-[7px] text-left"
      >
        <span
          className={`grid h-[16px] w-[16px] shrink-0 place-items-center rounded-[4px] text-[9px] font-bold ${
            conflicted ? "bg-negative/14 text-negative" : TONE_CLASS[meta.tone]
          }`}
          {...tip(conflicted ? "冲突" : meta.label)}        >
          {conflicted ? "!" : meta.letter}
        </span>

        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-soft">
          {entry.oldPath ? (
            <>
              <span className="text-ink-faint line-through decoration-ink-faint/40">{entry.oldPath}</span>
              <span className="px-1 text-ink-faint">→</span>
              <span className="font-medium text-ink">{entry.path}</span>
            </>
          ) : (
            <>
              <span className="text-ink-faint">{dirName(entry.path)}</span>
              <span className={active ? "font-medium text-ink" : ""}>{baseName(entry.path)}</span>
            </>
          )}
        </span>

        {status === "untracked" ? (
          <span className="shrink-0 rounded bg-positive/12 px-1 py-px text-[9px] font-medium text-positive">
            未跟踪
          </span>
        ) : null}
      </button>

      <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-raised/95 px-0.5 py-0.5 shadow-float group-hover:flex group-focus-within:flex">
        {side === "unstaged" ? (
          <IconButton label="暂存此文件" size="sm" onClick={onStage}>
            <Plus size={13} />
          </IconButton>
        ) : (
          <IconButton label="取消暂存此文件" size="sm" onClick={onUnstage}>
            <Undo2 size={13} />
          </IconButton>
        )}
        {onIgnore && status === "untracked" ? (
          <IconButton label="加入 .gitignore" size="sm" onClick={onIgnore}>
            <EyeOff size={13} />
          </IconButton>
        ) : null}
        <IconButton label="放弃此文件的改动" size="sm" tone="danger" onClick={onDiscard}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  );
}