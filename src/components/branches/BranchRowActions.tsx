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

import { useT } from "../../i18n";
import RowMenu from "../common/RowMenu";
import { tip } from "../common/Tooltip";

interface BranchRowActionsProps {
  busy: string | null;
  isRemote: boolean;
  isCurrent: boolean;
  /**
   * `row` = hover-revealed strip pinned to the right of a branch row;
   * `header` = always visible strip for a panel header (commit list of a branch).
   */
  variant?: "row" | "header";
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
  variant = "row",
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
  const t = useT();
  const shell =
    variant === "header"
      ? "flex items-center gap-0.5"
      : "absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-raised/95 px-0.5 py-0.5 shadow-float group-hover:flex group-focus-within:flex";

  if (busy) {
    return (
      <span
        className={
          variant === "header"
            ? "flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-ink-faint"
            : "absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-raised/95 px-1.5 py-1 text-[10px] text-ink-faint shadow-float"
        }
      >
        <Loader2 size={11} className="animate-spin" />
        {busy}
      </span>
    );
  }

  if (isRemote) {
    return (
      <div className={shell}>
        <BranchAction label={t("branches.actionCreateFromRemote")} onClick={onNewBranch}>
          <CloudDownload size={13} />
        </BranchAction>
      </div>
    );
  }

  const menuItems = [
    {
      label: t("branches.actionSquash"),
      icon: <Combine size={12} />,
      onSelect: onSquash,
    },
    {
      label: t("branches.actionRebase"),
      icon: <GitCommitVertical size={12} />,
      onSelect: onRebase,
    },
    {
      label: t("branches.actionCherryPick"),
      icon: <GitBranchPlus size={12} />,
      onSelect: onCherryPick,
    },
    {
      label: t("branches.actionMerge"),
      icon: <GitMerge size={12} />,
      onSelect: onMerge,
    },
    {
      label: t("branches.actionCompare"),
      icon: <GitCompare size={12} />,
      onSelect: onCompare,
    },
    {
      label: t("branches.actionTags"),
      icon: <Tag size={12} />,
      onSelect: onTags,
    },
    {
      label: t("branches.actionReflog"),
      icon: <History size={12} />,
      onSelect: onReflog,
    },
    ...(isCurrent
      ? []
      : [
          {
            label: t("branches.actionDeleteLocal"),
            icon: <Trash2 size={12} />,
            onSelect: onDelete,
            tone: "danger" as const,
            separatorBefore: true,
          },
        ]),
  ];

  return (
    <div className={shell}>
      {isCurrent ? null : (
        <BranchAction label={t("branches.actionSwitch")} onClick={onSwitch}>
          <ArrowRightLeft size={13} />
        </BranchAction>
      )}
      <BranchAction
        label={
          isCurrent ? t("branches.actionPullCurrent") : t("branches.actionPullOther")
        }
        onClick={onPull}
      >
        <Download size={13} />
      </BranchAction>
      <BranchAction label={t("branches.actionPush")} onClick={onPush}>
        <Upload size={13} />
      </BranchAction>
      <RowMenu label={t("branches.actionMore")} items={menuItems} />
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