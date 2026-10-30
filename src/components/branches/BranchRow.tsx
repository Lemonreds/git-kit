import { Cloud, GitBranch } from "lucide-react";

import { relativeTime, timeTooltip } from "../../lib/format";
import type { BranchSummary } from "../../lib/types";
import ShaChip from "../common/ShaChip";
import { tip } from "../common/Tooltip";
import BranchRowActions from "./BranchRowActions";

interface BranchRowProps {
  branch: BranchSummary;
  busy: string | null;
  onOpen: () => void;
  onSwitch: () => void;
  onSquash: () => void;
  onRebase: () => void;
  onCherryPick: () => void;
  onPush: () => void;
  onPull: () => void;
  onNewBranch: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onCompare: () => void;
  onTags: () => void;
  onReflog: () => void;
}

export default function BranchRow({
  branch,
  busy,
  onOpen,
  onSwitch,
  onSquash,
  onRebase,
  onCherryPick,
  onPush,
  onPull,
  onNewBranch,
  onDelete,
  onMerge,
  onCompare,
  onTags,
  onReflog,
}: BranchRowProps) {
  const commit = branch.lastCommit;
  const isRemote = branch.isRemote;
  const localCopy = isRemote && branch.hasLocal;

  // Icon carries the local / remote meaning: solid branch = local, dashed cloud
  // = only on the remote, solid accent cloud = remote with a local copy.
  const iconClass = isRemote
    ? localCopy
      ? "border border-positive/45 bg-positive/8 text-positive"
      : "border border-dashed border-line-strong bg-transparent text-ink-soft"
    : branch.isHead
      ? "bg-accent/12 text-accent"
      : "bg-canvas text-ink-faint";

  return (
    <div
      className={`group relative flex items-start rounded-lg transition-colors ${
        isRemote ? "hover:bg-ink/4" : "hover:bg-ink/5"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2.5 px-2 py-2 text-left"
      >
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${iconClass}`}>
          {isRemote ? <Cloud size={12} strokeWidth={2} /> : <GitBranch size={12} strokeWidth={2} />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={`truncate font-mono text-[12px] ${
                isRemote ? "font-normal text-ink-soft" : "font-medium text-ink"
              }`}
            >
              {branch.name}
            </span>
            {branch.isHead ? (
              <span className="shrink-0 rounded bg-accent px-1 py-px text-[9px] font-semibold tracking-wide text-white">
                HEAD
              </span>
            ) : null}
            {isRemote ? (
              <span className="shrink-0 rounded border border-line px-1 py-px text-[9px] font-medium text-ink-faint">
                远程
              </span>
            ) : null}
            {localCopy ? (
              <span className="shrink-0 rounded border border-positive/35 bg-positive/8 px-1 py-px text-[9px] font-medium text-positive">
                本地已有
              </span>
            ) : null}
            {branch.ahead ? (
              <span
                {...tip(`本地领先上游 ${branch.ahead} 个提交（未推送）`)}
                className="shrink-0 font-mono text-[9.5px] text-positive"
              >
                ↑{branch.ahead}
              </span>
            ) : null}
            {branch.behind ? (
              <span
                {...tip(`上游有 ${branch.behind} 个提交未同步到本地`)}
                className="shrink-0 font-mono text-[9.5px] text-warning"
              >
                ↓{branch.behind}
              </span>
            ) : null}
          </span>

          {commit ? (
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-soft">
              <ShaChip sha={commit.sha} className="px-1 py-px" />
              <span className="truncate">{commit.summary}</span>
            </span>
          ) : (
            <span className="mt-1 block text-[11px] text-ink-faint">暂无提交</span>
          )}
        </span>
      </button>

      {commit ? (
        <span
          {...tip(timeTooltip(commit.committedAt))}
          className="shrink-0 pr-2 pt-2 text-[10.5px] text-ink-faint transition-opacity group-hover:opacity-0"
        >
          {relativeTime(commit.committedAt)}
        </span>
      ) : null}

      <BranchRowActions
        busy={busy}
        isRemote={isRemote}
        isCurrent={branch.isHead}
        onSwitch={onSwitch}
        onSquash={onSquash}
        onRebase={onRebase}
        onCherryPick={onCherryPick}
        onPush={onPush}
        onPull={onPull}
        onNewBranch={onNewBranch}
        onDelete={onDelete}
        onMerge={onMerge}
        onCompare={onCompare}
        onTags={onTags}
        onReflog={onReflog}
      />
    </div>
  );
}