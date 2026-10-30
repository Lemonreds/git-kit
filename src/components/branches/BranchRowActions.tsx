import {
  ArrowRightLeft,
  CloudDownload,
  Combine,
  Download,
  GitBranchPlus,
  GitCommitVertical,
  GitCompare,
  GitMerge,
  History,
  Loader2,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";

import RowMenu from "../common/RowMenu";
import { tip } from "../common/Tooltip";

interface BranchRowActionsProps {
  busy: string | null;
  isRemote: boolean;
  isCurrent: boolean;
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

/**
 * Row actions ordered by frequency: switch / pull / push stay inline, the rest
 * lives in the `⋯` menu so the row does not turn into an icon strip.
 */
export default function BranchRowActions({
  busy,
  isRemote,
  isCurrent,
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
}: BranchRowActionsProps) {
  if (busy) {
    return (
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-raised/95 px-1.5 py-1 text-[10px] text-ink-faint shadow-float">
        <Loader2 size={11} className="animate-spin" />
        {busy}
      </span>
    );
  }

  if (isRemote) {
    return (
      <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-raised/95 px-0.5 py-0.5 shadow-float group-hover:flex group-focus-within:flex">
        <BranchAction label="基于此远程分支新建本地分支" onClick={onNewBranch}>
          <CloudDownload size={13} />
        </BranchAction>
      </div>
    );
  }

  const menuItems = [
    {
      label: "压缩提交",
      icon: <Combine size={12} />,
      onSelect: onSquash,
    },
    {
      label: "Rebase 到基线",
      icon: <GitCommitVertical size={12} />,
      onSelect: onRebase,
    },
    {
      label: "挑选提交（cherry-pick）",
      icon: <GitBranchPlus size={12} />,
      onSelect: onCherryPick,
    },
    {
      label: "合并其他分支到当前",
      icon: <GitMerge size={12} />,
      onSelect: onMerge,
    },
    {
      label: "对比分支",
      icon: <GitCompare size={12} />,
      onSelect: onCompare,
    },
    {
      label: "标签",
      icon: <Tag size={12} />,
      onSelect: onTags,
    },
    {
      label: "操作历史（reflog）",
      icon: <History size={12} />,
      onSelect: onReflog,
    },
    ...(isCurrent
      ? []
      : [
          {
            label: "删除本地分支",
            icon: <Trash2 size={12} />,
            onSelect: onDelete,
            tone: "danger" as const,
            separatorBefore: true,
          },
        ]),
  ];

  return (
    <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-raised/95 px-0.5 py-0.5 shadow-float group-hover:flex group-focus-within:flex">
      {isCurrent ? null : (
        <BranchAction label="切换到该分支（git checkout）" onClick={onSwitch}>
          <ArrowRightLeft size={13} />
        </BranchAction>
      )}
      <BranchAction
        label={
          isCurrent
            ? "拉取远程提交（fetch + 快进 / 合并）"
            : "拉取远程提交（会先切换到该分支）"
        }
        onClick={onPull}
      >
        <Download size={13} />
      </BranchAction>
      <BranchAction label="推送到远程" onClick={onPush}>
        <Upload size={13} />
      </BranchAction>
      <RowMenu label="更多操作" items={menuItems} />
    </div>
  );
}

function BranchAction({
  label,
  onClick,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      {...tip(label)}
      onClick={onClick}
      className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${
        tone === "danger"
          ? "text-ink-soft hover:bg-negative/10 hover:text-negative"
          : "text-ink-soft hover:bg-ink/8 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}