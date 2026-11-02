import { useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Archive,
  ChevronDown,
  Download,
  GitCommitHorizontal,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

import { useT } from "../../i18n";
import type { BranchSummary, WorktreeEntry } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import ConfirmDialog from "../common/ConfirmDialog";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import { SkeletonRows } from "../common/Skeleton";
import { tip } from "../common/Tooltip";
import PaneTabs from "../workspace/PaneTabs";
import PushDialog from "../branches/PushDialog";
import PullDialog from "../branches/PullDialog";
import ChangeRow from "./ChangeRow";
import CommitDialog from "./CommitDialog";
import StashDialog from "./StashDialog";

export default function ChangesPanel() {
  const t = useT();
  const {
    changes,
    changesLoading: loading,
    target,
    snapshot,
    project,
    branches,
  } = useSlice((state) => ({
    changes: state.changes,
    changesLoading: state.changesLoading,
    target: state.worktreeTarget,
    snapshot: state.snapshot,
    project: state.activeProject,
    branches: state.branches,
  }));

  const openDiff = useAppStore((state) => state.openWorktreeDiff);
  const stageFile = useAppStore((state) => state.stageFile);
  const unstageFile = useAppStore((state) => state.unstageFile);
  const discardFile = useAppStore((state) => state.discardFile);
  const stageAll = useAppStore((state) => state.stageAll);
  const unstageAll = useAppStore((state) => state.unstageAll);
  const discardAll = useAppStore((state) => state.discardAll);
  const ignorePath = useAppStore((state) => state.ignorePath);
  const refreshChanges = useAppStore((state) => state.refreshChanges);

  const [pendingDiscard, setPendingDiscard] = useState<WorktreeEntry | null>(null);
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const entries = changes?.entries ?? [];
  const conflicted = entries.filter((entry) => entry.conflicted);
  const staged = entries.filter((entry) => !entry.conflicted && entry.staged);
  const unstaged = entries.filter((entry) => !entry.conflicted && entry.unstaged);

  const headBranch = changes?.headBranch ?? snapshot?.headBranch ?? null;
  const detached = headBranch?.startsWith("detached@") ?? false;
  const hasRemote = Boolean(
    snapshot?.url ?? snapshot?.remoteHost ?? project?.url ?? project?.remoteHost,
  );
  const currentBranch: BranchSummary | null = headBranch
    ? branches.find((branch) => branch.name === headBranch) ?? {
        refName: `refs/heads/${headBranch}`,
        name: headBranch,
        shortName: headBranch,
        isHead: true,
        isRemote: false,
        hasLocal: true,
        upstream: null,
        ahead: null,
        behind: null,
        lastCommit: null,
      }
    : null;
  const pushDisabled = !hasRemote || !currentBranch || detached;
  const pushHint = !hasRemote
    ? t("changes.pushHintNoRemote")
    : detached
      ? t("changes.pushHintDetached")
      : !currentBranch
        ? t("changes.pushHintNoBranch")
        : t("changes.pushHintBranch", { branch: currentBranch.name });
  const pullDisabled = pushDisabled;
  const pullHint = !hasRemote
    ? t("changes.pullHintNoRemote")
    : detached
      ? t("changes.pullHintDetached")
      : !currentBranch
        ? t("changes.pullHintNoBranch")
        : t("changes.pullHintBranch", { branch: currentBranch.name });

  const toggle = (key: string) =>
    setCollapsed((state) => ({ ...state, [key]: !state[key] }));

  const renderGroup = (
    key: string,
    title: string,
    list: WorktreeEntry[],
    side: "staged" | "unstaged",
    action?: ReactNode,
  ) => {
    if (list.length === 0) return null;
    const isCollapsed = collapsed[key] ?? false;
    return (
      <section key={key} className="mb-2">
        <div className="flex w-full items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-ink/4">
          <button
            type="button"
            onClick={() => toggle(key)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-faint transition-colors hover:text-ink-soft"
          >
            <ChevronDown
              size={11}
              className={`shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
            />
            {title}
            <span className="rounded-full bg-ink/6 px-1.5 text-[9.5px] font-medium text-ink-faint">
              {list.length}
            </span>
          </button>
          {action}
        </div>
        {isCollapsed ? null : (
          <div className="space-y-px">
            {list.map((entry) => {
              const active = target?.path === entry.path && target.staged === (side === "staged");
              return (
                <ChangeRow
                  key={`${side}:${entry.path}`}
                  entry={entry}
                  side={side}
                  active={active}
                  onOpen={() => void openDiff(entry.path, side === "staged")}
                  onStage={() => void stageFile(entry.path)}
                  onUnstage={() => void unstageFile(entry.path)}
                  onDiscard={() => setPendingDiscard(entry)}
                  onIgnore={
                    side === "unstaged" && entry.unstaged === "untracked" && !entry.conflicted
                      ? () => void ignorePath(entry.path, false)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-11 shrink-0 items-center gap-2 border-b border-line px-2.5"
      >
        <PaneTabs active="changes" changesCount={entries.length} />
        <div className="no-drag ml-auto flex min-w-0 shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCommitOpen(true)}
            disabled={staged.length === 0}
            {...tip(
              staged.length > 0
                ? t("changes.commitStagedTooltip", { count: staged.length })
                : t("changes.commitNeedsStaged"),
            )}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-40 ${
              staged.length > 0
                ? "border-accent/40 bg-accent-soft text-accent hover:bg-accent/15"
                : "border-line text-ink-faint"
            }`}
          >
            <GitCommitHorizontal size={12} />
            {staged.length > 0 ? (
              <span className="rounded-full bg-accent/15 px-1 font-mono text-[9.5px]">
                {staged.length}
              </span>
            ) : null}
          </button>
          <IconButton label={t("changes.stashLabel")} onClick={() => setStashOpen(true)}>
            <Archive size={14} />
          </IconButton>
          <IconButton label={pullHint} onClick={() => setPullOpen(true)} disabled={pullDisabled}>
            <Download size={14} />
          </IconButton>
          <IconButton label={pushHint} onClick={() => setPushOpen(true)} disabled={pushDisabled}>
            <Upload size={14} />
          </IconButton>
          <IconButton
            label={t("changes.refresh")}
            onClick={() => void refreshChanges()}
            disabled={!project || loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          </IconButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && !changes ? (
          <SkeletonRows rows={6} />
        ) : entries.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={t("changes.clean")} />
        ) : (
          <>
            {conflicted.length > 0 ? (
              <div className="mb-2 rounded-lg border border-negative/30 bg-negative/8 px-2 py-1.5 text-[11px] text-negative">
                {t("changes.conflictBanner", { count: conflicted.length })}
              </div>
            ) : null}
            {renderGroup("conflicted", t("changes.conflict"), conflicted, "unstaged")}
            {renderGroup(
              "staged",
              t("changes.stagedGroup"),
              staged,
              "staged",
              <GroupAction
                label={t("changes.unstageAll")}
                description={t("changes.unstageAllDescription")}
                onClick={() => void unstageAll()}
              >
                <ArrowDownToLine size={11} />
              </GroupAction>,
            )}
            {renderGroup(
              "unstaged",
              t("changes.unstagedGroup"),
              unstaged,
              "unstaged",
              <>
                <GroupAction
                  label={t("changes.stageAll")}
                  description={t("changes.stageAllDescription")}
                  onClick={() => void stageAll()}
                >
                  <ArrowUpFromLine size={11} />
                </GroupAction>
                <GroupAction
                  label={t("changes.discardAll")}
                  description={t("changes.discardAllDescriptionShort")}
                  tone="danger"
                  onClick={() => setConfirmDiscardAll(true)}
                >
                  <Trash2 size={11} />
                </GroupAction>
              </>,
            )}
            {loading ? (
              <p className="flex items-center gap-1.5 px-2 py-2 text-[10.5px] text-ink-faint">
                <Loader2 size={11} className="animate-spin" />
                {t("changes.refreshing")}
              </p>
            ) : null}
          </>
        )}
      </div>

      {stashOpen ? <StashDialog onClose={() => setStashOpen(false)} /> : null}

      {commitOpen ? (
        <CommitDialog
          staged={staged}
          branch={changes?.headBranch ?? null}
          conflictedCount={conflicted.length}
          onClose={() => setCommitOpen(false)}
        />
      ) : null}

      {pushOpen && currentBranch ? (
        <PushDialog branch={currentBranch} onClose={() => setPushOpen(false)} />
      ) : null}

      {pullOpen && currentBranch ? (
        <PullDialog branch={currentBranch} onClose={() => setPullOpen(false)} />
      ) : null}

      <ConfirmDialog
        open={pendingDiscard !== null}
        title={t("changes.discardFile")}
        description={t("changes.discardFileDescription", {
          path: pendingDiscard?.path ?? "",
        })}
        confirmLabel={t("changes.discardFileConfirm")}
        tone="danger"
        onConfirm={() => {
          if (pendingDiscard) void discardFile(pendingDiscard.path);
          setPendingDiscard(null);
        }}
        onCancel={() => setPendingDiscard(null)}
      />

      <ConfirmDialog
        open={confirmDiscardAll}
        title={t("changes.discardAll")}
        description={t("changes.discardAllDescription", { count: entries.length })}
        confirmLabel={t("changes.discardAllConfirm")}
        tone="danger"
        onConfirm={() => {
          void discardAll();
          setConfirmDiscardAll(false);
        }}
        onCancel={() => setConfirmDiscardAll(false)}
      />
    </section>
  );
}

/** Inline "stage all / discard all" action shown on the right of a change group header. */
function GroupAction({
  label,
  description,
  tone = "default",
  onClick,
  children,
}: {
  label: string;
  description: string;
  tone?: "default" | "danger";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={description}
      {...tip(description)}
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal transition-colors ${
        tone === "danger"
          ? "text-ink-faint hover:bg-negative/10 hover:text-negative"
          : "text-ink-faint hover:bg-accent-soft hover:text-accent"
      }`}
    >
      {children}
      {label}
    </button>
  );
}