import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Cloud, CloudDownload, GitBranch, GitBranchPlus, Loader2, Search, Trash2, X } from "lucide-react";

import type { BranchSummary } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import { REMOTE_PAGE } from "../../store/shared";
import EmptyState from "../common/EmptyState";
import ConfirmDialog from "../common/ConfirmDialog";
import IconButton from "../common/IconButton";
import { SkeletonRows } from "../common/Skeleton";
import PaneTabs from "../workspace/PaneTabs";
import BranchRow from "./BranchRow";
import VirtualBranchList, { type BranchListEntry } from "./VirtualBranchList";

// Lazy load dialogs to reduce initial bundle size
const CherryPickDialog = lazy(() => import("./CherryPickDialog"));
const CreateBranchDialog = lazy(() => import("./CreateBranchDialog"));
const DeleteBranchesDialog = lazy(() => import("./DeleteBranchesDialog"));
const PullDialog = lazy(() => import("./PullDialog"));
const RebaseDialog = lazy(() => import("./RebaseDialog"));
const MergeDialog = lazy(() => import("./MergeDialog"));
const CompareDialog = lazy(() => import("./CompareDialog"));
const PushDialog = lazy(() => import("./PushDialog"));
const ReflogDialog = lazy(() => import("./ReflogDialog"));
const TagDialog = lazy(() => import("./TagDialog"));
const SquashDialog = lazy(() => import("./SquashDialog"));

function matches(branch: BranchSummary, keyword: string): boolean {
  if (!keyword) return true;
  return (
    branch.name.toLowerCase().includes(keyword) ||
    (branch.lastCommit?.summary.toLowerCase().includes(keyword) ?? false)
  );
}

/** Above this many rows the list is virtualised (only visible rows are mounted). */
const VIRTUALIZE_AFTER = 40;

export default function BranchPanel() {
  // One subscription for the branch/repo fields this panel renders; actions are
  // stable references, so they stay individually selected.
  const {
    branches,
    branchesLoading: loading,
    branchFilter: filter,
    changes,
    snapshot,
    project,
    remoteBranches,
    remoteLoading,
    remoteLoaded,
    remoteTotal,
    remoteLimit,
    remoteShown,
  } = useSlice((state) => ({
    branches: state.branches,
    branchesLoading: state.branchesLoading,
    branchFilter: state.branchFilter,
    changes: state.changes,
    snapshot: state.snapshot,
    project: state.activeProject,
    remoteBranches: state.remoteBranches,
    remoteLoading: state.remoteLoading,
    remoteLoaded: state.remoteLoaded,
    remoteTotal: state.remoteTotal,
    remoteLimit: state.remoteLimit,
    remoteShown: state.remoteBranches.length,
  }));

  const setFilter = useAppStore((state) => state.setBranchFilter);
  const openBranch = useAppStore((state) => state.openBranch);
  const fetchAll = useAppStore((state) => state.fetchAll);
  const switchBranch = useAppStore((state) => state.switchBranch);
  const loadRemoteBranches = useAppStore((state) => state.loadRemoteBranches);
  const loadMoreRemoteBranches = useAppStore((state) => state.loadMoreRemoteBranches);
  const collapseRemoteBranches = useAppStore((state) => state.collapseRemoteBranches);
  const deleteLocalBranches = useAppStore((state) => state.deleteLocalBranches);
  const notify = useAppStore((state) => state.notify);
  const showAlert = useAppStore((state) => state.showAlert);

  const [squashTarget, setSquashTarget] = useState<BranchSummary | null>(null);
  const [rebaseTarget, setRebaseTarget] = useState<BranchSummary | null>(null);
  const [cherryTarget, setCherryTarget] = useState<BranchSummary | null>(null);
  const [pushTarget, setPushTarget] = useState<BranchSummary | null>(null);
  const [pullTarget, setPullTarget] = useState<BranchSummary | null>(null);
  const [createBase, setCreateBase] = useState<string | null | undefined>(undefined);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<BranchSummary | null>(null);
  const [compareTarget, setCompareTarget] = useState<BranchSummary | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [reflogOpen, setReflogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BranchSummary | null>(null);
  const [pendingForceDelete, setPendingForceDelete] = useState<BranchSummary | null>(null);
  const [busy, setBusy] = useState<{ refName: string; label: string } | null>(null);
  const [fetchingAll, setFetchingAll] = useState(false);

  const keyword = filter.trim().toLowerCase();
  const localFiltered = useMemo(
    () => branches.filter((branch) => matches(branch, keyword)),
    [branches, keyword],
  );
  const remoteFiltered = useMemo(
    () => remoteBranches.filter((branch) => matches(branch, keyword)),
    [remoteBranches, keyword],
  );

  const hasRemote = snapshot
    ? Boolean(snapshot.url ?? snapshot.remoteHost)
    : Boolean(project?.url ?? project?.remoteHost);
  const localBranches = branches.filter((branch) => !branch.isRemote);
  const currentBranch = branches.find((branch) => branch.isHead) ?? null;

  // The first page loads by itself: no footer button, 10 newest branches is
  // enough to orient yourself. Tried once per project so a failing read cannot
  // turn into a retry loop.
  const autoLoadFor = useRef<string | null>(null);
  useEffect(() => {
    if (!hasRemote || remoteLoaded || remoteLoading) return;
    if (!snapshot || branches.length === 0) return;
    const key = project?.id ?? "";
    if (autoLoadFor.current === key) return;
    autoLoadFor.current = key;
    void loadRemoteBranches();
  }, [hasRemote, remoteLoaded, remoteLoading, snapshot, branches.length, project?.id, loadRemoteBranches]);

  const canLoadMoreRemote = remoteShown < remoteTotal;
  const canCollapseRemote = remoteLimit > REMOTE_PAGE;
  // With a filter active and more remote pages left, keep the list (and its
  // 加载更多 button) visible instead of claiming there is no match at all.
  const onlyLoadedPagesMatchNothing =
    localFiltered.length === 0 &&
    remoteFiltered.length === 0 &&
    remoteLoaded &&
    canLoadMoreRemote &&
    keyword.length > 0;

  /**
   * Remote section divider. No label on purpose: the numbers were noise, the
   * line alone is enough to separate remote rows from local ones. The paging
   * buttons ride on the same line (加载更多 left, 收起 right).
   */
  const remoteHeaderNode = (
    <div className="flex items-center gap-2 px-2 pb-1 pt-3">
      {canLoadMoreRemote ? (
        <button
          type="button"
          onClick={() => void loadMoreRemoteBranches()}
          disabled={remoteLoading}
          title={`再加载 ${REMOTE_PAGE} 条远程分支（已显示 ${remoteShown} / 共 ${remoteTotal}）`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-px text-[10px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-default disabled:opacity-50"
        >
          {remoteLoading ? <Loader2 size={9} className="animate-spin" /> : <Cloud size={9} />}
          加载更多 +{REMOTE_PAGE}
        </button>
      ) : null}
      <span className="h-px flex-1 bg-line" />
      {canCollapseRemote ? (
        <button
          type="button"
          onClick={() => collapseRemoteBranches()}
          title={`收起，只保留最新 ${REMOTE_PAGE} 条`}
          className="shrink-0 rounded-md border border-line px-1.5 py-px text-[10px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
        >
          收起
        </button>
      ) : null}
    </div>
  );

  const remoteLoadingNode = (
    <div className="flex items-center gap-1.5 px-2 pb-1 pt-3 text-[10px] text-ink-faint">
      <Loader2 size={10} className="animate-spin" />
      正在读取远程分支…
    </div>
  );

  // Flatten local rows + the remote section into one list so both share a single
  // (virtualised) scroll container.
  const listEntries = useMemo<BranchListEntry[]>(() => {
    const entries: BranchListEntry[] = localFiltered.map((branch): BranchListEntry => ({
      kind: "row",
      branch,
    }));
    if (!remoteLoaded) {
      // First page is loading in the background: say so instead of a footer button.
      if (hasRemote && remoteLoading) {
        entries.push({ kind: "node", key: "remote-loading", node: remoteLoadingNode });
      }
      return entries;
    }

    // Nothing on the remote side: no divider, no rows, no copy.
    if (remoteTotal === 0) return entries;

    entries.push({ kind: "node", key: "remote-header", node: remoteHeaderNode });
    entries.push(...remoteFiltered.map((branch): BranchListEntry => ({ kind: "row", branch })));
    return entries;
    // remoteHeaderNode / remoteEmptyNode are rebuilt on every render on purpose:
    // they render the current counters and loading state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    localFiltered,
    remoteFiltered,
    remoteLoaded,
    remoteShown,
    remoteTotal,
    remoteLimit,
    remoteLoading,
    hasRemote,
  ]);

  const rowCount = localFiltered.length + (remoteLoaded ? remoteFiltered.length : 0);
  const virtualized = rowCount >= VIRTUALIZE_AFTER;
  const listKey = `${project?.id ?? ""}::${keyword}::${remoteLoaded ? "remote" : "local"}::${remoteLimit}`;

  const handleFetchAll = async () => {
    setFetchingAll(true);
    await fetchAll();
    setFetchingAll(false);
  };

  const doSwitch = async (branch: BranchSummary) => {
    if (branch.isHead) return;
    setBusy({ refName: branch.refName, label: "切换中" });
    await switchBranch(branch.name);
    setBusy(null);
  };

  /** Uncommitted changes follow the checkout; confirm before moving them. */
  const requestSwitch = (branch: BranchSummary) => {
    if (branch.isHead) return;
    if ((changes?.entries.length ?? 0) > 0) {
      setPendingSwitch(branch);
      return;
    }
    void doSwitch(branch);
  };

  /** Quick delete from the row: `-d` first, offer `-D` only when unmerged. */
  const quickDelete = async (branch: BranchSummary, force: boolean) => {
    setBusy({ refName: branch.refName, label: force ? "强制删除" : "删除中" });
    const result = await deleteLocalBranches([branch.name], force);
    setBusy(null);
    if (!result.ok) return;

    const deleted = result.deleted ?? [];
    const failed = result.failed ?? [];
    if (deleted.length > 0) {
      notify("success", `已删除本地分支 ${deleted[0]}`);
      return;
    }
    const reason = failed[0]?.reason ?? "删除失败";
    if (!force && reason.includes("未合并")) {
      setPendingForceDelete(branch);
      return;
    }
    if (reason.length > 120 || reason.includes("\n")) {
      showAlert(`删除分支 ${branch.name} 失败`, reason);
    } else {
      notify("error", reason);
    }
  };

  const renderRow = (branch: BranchSummary) => (
    <BranchRow
      key={branch.refName}
      branch={branch}
      busy={busy?.refName === branch.refName ? busy.label : null}
      onOpen={() => void openBranch(branch.refName)}
      onSwitch={() => requestSwitch(branch)}
      onSquash={() => setSquashTarget(branch)}
      onRebase={() => setRebaseTarget(branch)}
      onCherryPick={() => setCherryTarget(branch)}
      onPush={() => setPushTarget(branch)}
      onPull={() => setPullTarget(branch)}
      onNewBranch={() => setCreateBase(branch.refName)}
      onDelete={() => setPendingDelete(branch)}
      onMerge={() => {
        if (currentBranch) setMergeOpen(true);
        else notify("error", "当前不在任何分支上，无法合并");
      }}
      onCompare={() => setCompareTarget(branch)}
      onTags={() => setTagsOpen(true)}
      onReflog={() => setReflogOpen(true)}
    />
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-11 shrink-0 items-center gap-2 border-b border-line px-2.5"
      >
        <PaneTabs active="branches" changesCount={changes?.entries.length ?? 0} />
        <div className="no-drag ml-auto flex items-center gap-0.5">
          <span className="shrink-0 pr-1 text-[10.5px] text-ink-faint">
            本地 {localBranches.length}
            {remoteLoaded ? ` · 远程 ${remoteBranches.length}` : ""}
          </span>
          <IconButton
            label="拉取所有远程引用（git fetch --all --prune）"
            onClick={() => void handleFetchAll()}
            disabled={!hasRemote || fetchingAll || !snapshot}
          >
            {fetchingAll ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}
          </IconButton>
          <IconButton label="新建分支" onClick={() => setCreateBase(null)} disabled={!snapshot}>
            <GitBranchPlus size={14} />
          </IconButton>
          <IconButton
            label="删除分支"
            tone="danger"
            onClick={() => setDeleteOpen(true)}
            disabled={localBranches.length === 0}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </header>

      <div className="shrink-0 px-3 pb-1.5 pt-2.5">
        <label className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas/50 px-2 py-1.5 transition-colors focus-within:border-accent/60 focus-within:bg-panel">
          <Search size={12} className="shrink-0 text-ink-faint" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="筛选分支或提交说明"
            className="w-full bg-transparent text-[11.5px] text-ink outline-none placeholder:text-ink-faint"
          />
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="清除筛选"
              className="grid h-4 w-4 place-items-center rounded text-ink-faint hover:bg-ink/8 hover:text-ink"
            >
              <X size={10} />
            </button>
          ) : null}
        </label>
      </div>

      <div
        className={`min-h-0 flex-1 px-2 pb-3 pt-1 ${virtualized ? "overflow-hidden" : "overflow-y-auto"}`}
      >
        {loading ? (
          <SkeletonRows rows={7} />
        ) : branches.length === 0 && remoteBranches.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="还没有分支"
            description="完成首次提交后，这里会显示分支与提交历史。"
          />
        ) : localFiltered.length === 0 && remoteFiltered.length === 0 && !onlyLoadedPagesMatchNothing ? (
          <EmptyState icon={Search} title="没有匹配的分支" description="换一个关键词试试。" />
        ) : virtualized ? (
          <VirtualBranchList
            entries={listEntries}
            renderBranch={renderRow}
            listKey={listKey}
          />
        ) : (
          <div className="space-y-px">
            {localFiltered.map(renderRow)}

            {remoteLoaded && remoteTotal > 0 ? (
              <>
                {remoteHeaderNode}
                {remoteFiltered.map(renderRow)}
              </>
            ) : hasRemote && remoteLoading ? (
              remoteLoadingNode
            ) : null}
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        {squashTarget ? (
          <SquashDialog branch={squashTarget} onClose={() => setSquashTarget(null)} />
        ) : null}
        {rebaseTarget ? (
          <RebaseDialog branch={rebaseTarget} onClose={() => setRebaseTarget(null)} />
        ) : null}
        {cherryTarget ? (
          <CherryPickDialog branch={cherryTarget} onClose={() => setCherryTarget(null)} />
        ) : null}
        {pushTarget ? <PushDialog branch={pushTarget} onClose={() => setPushTarget(null)} /> : null}
        {pullTarget ? (
          <PullDialog
            branch={pullTarget}
            switchFirst={!pullTarget.isHead}
            onClose={() => setPullTarget(null)}
          />
        ) : null}
        {deleteOpen ? (
          <DeleteBranchesDialog branches={branches} onClose={() => setDeleteOpen(false)} />
        ) : null}
        {createBase !== undefined ? (
          <CreateBranchDialog
            key={createBase ?? "default"}
            initialBaseRef={createBase ?? undefined}
            onClose={() => setCreateBase(undefined)}
          />
        ) : null}
      </Suspense>

      {pendingSwitch ? (
        <ConfirmDialog
          open
          title={`切换到 ${pendingSwitch.name}？`}
          description={`当前工作区有 ${changes?.entries.length ?? 0} 项未提交改动，切换分支会带着这些改动一起过去；若目标分支改了同一文件，git 会拒绝切换并保留现场。`}
          confirmLabel="切换"
          onConfirm={() => {
            const target = pendingSwitch;
            setPendingSwitch(null);
            void doSwitch(target);
          }}
          onCancel={() => setPendingSwitch(null)}
        />
      ) : null}

      <Suspense fallback={null}>
        {mergeOpen && currentBranch ? (
          <MergeDialog current={currentBranch} onClose={() => setMergeOpen(false)} />
        ) : null}
        {compareTarget ? (
          <CompareDialog branch={compareTarget} onClose={() => setCompareTarget(null)} />
        ) : null}
        {tagsOpen ? <TagDialog onClose={() => setTagsOpen(false)} /> : null}
        {reflogOpen ? <ReflogDialog onClose={() => setReflogOpen(false)} /> : null}
      </Suspense>

      {pendingDelete ? (
        <ConfirmDialog
          open
          title={`删除本地分支 ${pendingDelete.name}？`}
          description="只删除本地分支，远程分支不受影响；已合并的直接删除，未合并的会再询问一次。"
          confirmLabel="删除"
          tone="danger"
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            void quickDelete(target, false);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}

      {pendingForceDelete ? (
        <ConfirmDialog
          open
          title={`${pendingForceDelete.name} 有未合并的提交`}
          description={`强制删除会永久丢失这些提交${
            pendingForceDelete.ahead ? `（其中 ${pendingForceDelete.ahead} 个还未推送）` : ""
          }，确定继续？`}
          confirmLabel="强制删除"
          tone="danger"
          onConfirm={() => {
            const target = pendingForceDelete;
            setPendingForceDelete(null);
            void quickDelete(target, true);
          }}
          onCancel={() => setPendingForceDelete(null)}
        />
      ) : null}
    </section>
  );
}