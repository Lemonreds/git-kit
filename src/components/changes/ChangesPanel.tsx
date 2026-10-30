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
    ? "该仓库没有配置远程地址，无法推送"
    : detached
      ? "游离 HEAD 状态无法推送分支"
      : !currentBranch
        ? "当前没有可推送的分支"
        : `推送 ${currentBranch.name} 到远程`;
  const pullDisabled = pushDisabled;
  const pullHint = !hasRemote
    ? "该仓库没有配置远程地址，无法拉取"
    : detached
      ? "游离 HEAD 状态无法拉取"
      : !currentBranch
        ? "当前没有可拉取的分支"
        : `拉取 ${currentBranch.name} 的远程提交`;

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
                ? `提交已暂存的 ${staged.length} 个文件`
                : "提交（先暂存文件）",
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
          <IconButton label="暂存改动（stash）" onClick={() => setStashOpen(true)}>
            <Archive size={14} />
          </IconButton>
          <IconButton label={pullHint} onClick={() => setPullOpen(true)} disabled={pullDisabled}>
            <Download size={14} />
          </IconButton>
          <IconButton label={pushHint} onClick={() => setPushOpen(true)} disabled={pushDisabled}>
            <Upload size={14} />
          </IconButton>
          <IconButton
            label="刷新改动列表"
            onClick={() => void refreshChanges()}
            disabled={!project || loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          </IconButton>
          <IconButton
            label="放弃全部改动"
            tone="danger"
            onClick={() => setConfirmDiscardAll(true)}
            disabled={entries.length === 0}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && !changes ? (
          <SkeletonRows rows={6} />
        ) : entries.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="工作区是干净的" />
        ) : (
          <>
            {conflicted.length > 0 ? (
              <div className="mb-2 rounded-lg border border-negative/30 bg-negative/8 px-2 py-1.5 text-[11px] text-negative">
                存在 {conflicted.length} 个冲突文件，解决后暂存即可继续操作
              </div>
            ) : null}
            {renderGroup("conflicted", "冲突", conflicted, "unstaged")}
            {renderGroup(
              "staged",
              "已暂存",
              staged,
              "staged",
              <GroupAction
                label="全部取消暂存"
                description="把已暂存的文件全部退回未暂存状态"
                onClick={() => void unstageAll()}
              >
                <ArrowDownToLine size={11} />
              </GroupAction>,
            )}
            {renderGroup(
              "unstaged",
              "未暂存",
              unstaged,
              "unstaged",
              <GroupAction
                label="全部添加"
                description="把全部未暂存改动与未跟踪文件加入暂存区（git add -A）"
                onClick={() => void stageAll()}
              >
                <ArrowUpFromLine size={11} />
              </GroupAction>,
            )}
            {loading ? (
              <p className="flex items-center gap-1.5 px-2 py-2 text-[10.5px] text-ink-faint">
                <Loader2 size={11} className="animate-spin" />
                正在刷新
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
        title="放弃该文件的改动"
        description={`将丢弃「${pendingDiscard?.path ?? ""}」的未提交修改，该操作不可撤销。`}
        confirmLabel="放弃改动"
        tone="danger"
        onConfirm={() => {
          if (pendingDiscard) void discardFile(pendingDiscard.path);
          setPendingDiscard(null);
        }}
        onCancel={() => setPendingDiscard(null)}
      />

      <ConfirmDialog
        open={confirmDiscardAll}        title="放弃全部改动"
        description={`将丢弃当前分支所有未提交的修改（含 ${entries.length} 个文件），并删除未跟踪的新文件，该操作不可撤销。`}
        confirmLabel="全部放弃"
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

/** Inline “全部…” action shown on the right of a change group header. */
function GroupAction({
  label,
  description,
  onClick,
  children,
}: {
  label: string;
  description: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={description}
      {...tip(description)}
      className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-ink-faint transition-colors hover:bg-accent-soft hover:text-accent"
    >
      {children}
      {label}
    </button>
  );
}