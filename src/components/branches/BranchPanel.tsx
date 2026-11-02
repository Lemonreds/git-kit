import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Cloud, CloudDownload, GitBranch, GitBranchPlus, Loader2, Search, Trash2, X } from "lucide-react";

import { useLocale, useT } from "../../i18n";
import type { BranchSummary } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import { REMOTE_PAGE } from "../../store/shared";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import { SkeletonRows } from "../common/Skeleton";
import PaneTabs from "../workspace/PaneTabs";
import BranchRow from "./BranchRow";
import { useBranchActions } from "./useBranchActions";
import VirtualBranchList, { type BranchListEntry } from "./VirtualBranchList";

// Lazy load dialogs to reduce initial bundle size
const DeleteBranchesDialog = lazy(() => import("./DeleteBranchesDialog"));

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
  const t = useT();
  const locale = useLocale();
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
  const loadRemoteBranches = useAppStore((state) => state.loadRemoteBranches);
  const loadMoreRemoteBranches = useAppStore((state) => state.loadMoreRemoteBranches);
  const collapseRemoteBranches = useAppStore((state) => state.collapseRemoteBranches);

  // Switch / delete / merge / compare / … live in the shared hook so the same
  // entry points can also be rendered by the commit list of a branch.
  const { busy, actions, dialogs } = useBranchActions();
  const [deleteOpen, setDeleteOpen] = useState(false);
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
  // load-more button) visible instead of claiming there is no match at all.
  const onlyLoadedPagesMatchNothing =
    localFiltered.length === 0 &&
    remoteFiltered.length === 0 &&
    remoteLoaded &&
    canLoadMoreRemote &&
    keyword.length > 0;

  /**
   * Remote section divider. No label on purpose: the numbers were noise, the
   * line alone is enough to separate remote rows from local ones. The paging
   * buttons ride on the same line (load more on the left, collapse on the right).
   */
  const remoteHeaderNode = (
    <div className="flex items-center gap-2 px-2 pb-1 pt-3">
      {canLoadMoreRemote ? (
        <button
          type="button"
          onClick={() => void loadMoreRemoteBranches()}
          disabled={remoteLoading}
          title={t("branches.loadMoreTip", {
            page: REMOTE_PAGE,
            shown: remoteShown,
            total: remoteTotal,
          })}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-px text-[10px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-default disabled:opacity-50"
        >
          {remoteLoading ? <Loader2 size={9} className="animate-spin" /> : <Cloud size={9} />}
          {t("branches.loadMore", { page: REMOTE_PAGE })}
        </button>
      ) : null}
      <span className="h-px flex-1 bg-line" />
      {canCollapseRemote ? (
        <button
          type="button"
          onClick={() => collapseRemoteBranches()}
          title={t("branches.collapseTip", { page: REMOTE_PAGE })}
          className="shrink-0 rounded-md border border-line px-1.5 py-px text-[10px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
        >
          {t("branches.collapse")}
        </button>
      ) : null}
    </div>
  );

  const remoteLoadingNode = (
    <div className="flex items-center gap-1.5 px-2 pb-1 pt-3 text-[10px] text-ink-faint">
      <Loader2 size={10} className="animate-spin" />
      {t("branches.loadingRemote")}
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
    locale,
  ]);

  const rowCount = localFiltered.length + (remoteLoaded ? remoteFiltered.length : 0);
  const virtualized = rowCount >= VIRTUALIZE_AFTER;
  const listKey = `${project?.id ?? ""}::${keyword}::${remoteLoaded ? "remote" : "local"}::${remoteLimit}`;

  const handleFetchAll = async () => {
    setFetchingAll(true);
    await fetchAll();
    setFetchingAll(false);
  };

  const renderRow = (branch: BranchSummary) => (
    <BranchRow
      key={branch.refName}
      branch={branch}
      busy={busy?.refName === branch.refName ? busy.label : null}
      onOpen={() => void openBranch(branch.refName)}
      onSwitch={() => actions.switchTo(branch)}
      onSquash={() => actions.squash(branch)}
      onRebase={() => actions.rebase(branch)}
      onCherryPick={() => actions.cherryPick(branch)}
      onPush={() => actions.push(branch)}
      onPull={() => actions.pull(branch)}
      onNewBranch={() => actions.create(branch.refName)}
      onDelete={() => actions.remove(branch)}
      onMerge={() => actions.merge()}
      onCompare={() => actions.compare(branch)}
      onTags={() => actions.tags()}
      onReflog={() => actions.reflog()}
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
            {t("branches.localCount", { count: localBranches.length })}
            {remoteLoaded ? t("branches.remoteCountSuffix", { count: remoteBranches.length }) : ""}
          </span>
          <IconButton
            label={t("branches.fetchAll")}
            onClick={() => void handleFetchAll()}
            disabled={!hasRemote || fetchingAll || !snapshot}
          >
            {fetchingAll ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}
          </IconButton>
          <IconButton label={t("branches.newBranch")} onClick={() => actions.create(null)} disabled={!snapshot}>
            <GitBranchPlus size={14} />
          </IconButton>
          <IconButton
            label={t("branches.deleteBranch")}
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
            placeholder={t("branches.filterPlaceholder")}
            className="w-full bg-transparent text-[11.5px] text-ink outline-none placeholder:text-ink-faint"
          />
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label={t("branches.clearFilter")}
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
            title={t("branches.emptyTitle")}
            description={t("branches.emptyDescription")}
          />
        ) : localFiltered.length === 0 && remoteFiltered.length === 0 && !onlyLoadedPagesMatchNothing ? (
          <EmptyState
            icon={Search}
            title={t("branches.noMatchTitle")}
            description={t("branches.noMatchDescription")}
          />
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
        {deleteOpen ? (
          <DeleteBranchesDialog branches={branches} onClose={() => setDeleteOpen(false)} />
        ) : null}
      </Suspense>

      {dialogs}
    </section>
  );
}