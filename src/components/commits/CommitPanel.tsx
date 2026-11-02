import { ChevronLeft, GitBranch, GitCommitHorizontal, Loader2, Tag } from "lucide-react";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import BranchRowActions from "../branches/BranchRowActions";
import { useBranchActions } from "../branches/useBranchActions";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import { SkeletonRows } from "../common/Skeleton";
import CommitRow from "./CommitRow";
import VirtualCommitList from "./VirtualCommitList";

/** Above this many rows the history is virtualised. */
const VIRTUALIZE_AFTER = 40;

export default function CommitPanel() {
  const t = useT();
  const {
    project,
    branch,
    tag,
    commits,
    loading,
    hasMore,
    selectedSha,
  } = useSlice((state) => ({
    project: state.activeProject,
    branch: state.selectedBranch,
    tag: state.selectedTag,
    commits: state.commits,
    loading: state.commitsLoading,
    hasMore: state.commitsHasMore,
    selectedSha: state.selectedCommitSha,
  }));

  const selectCommit = useAppStore((state) => state.selectCommit);
  const loadMore = useAppStore((state) => state.loadMoreCommits);
  const backToBranches = useAppStore((state) => state.backToBranches);
  // Same entry points as the branch row this list was opened from.
  const { busy, actions, dialogs } = useBranchActions();
  const virtualized = commits.length >= VIRTUALIZE_AFTER;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-2"
      >
        <IconButton label={t("commits.backToBranches")} onClick={backToBranches}>
          <ChevronLeft size={16} />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px]">
          <span className="truncate text-ink-faint">{project?.name}</span>
          <span className="shrink-0 text-line-strong">/</span>
          <span className="flex min-w-0 items-center gap-1 font-mono text-[11.5px] font-medium text-ink">
            {tag ? (
              <Tag size={11} className="shrink-0 text-ink-faint" />
            ) : (
              <GitBranch size={11} className="shrink-0 text-ink-faint" />
            )}
            <span className="truncate">{tag?.name ?? branch?.name ?? t("commits.history")}</span>
            {tag ? (
              <span className="shrink-0 rounded border border-line px-1 py-px font-sans text-[9px] font-medium text-ink-faint">
                {t("tags.badge")}
              </span>
            ) : null}
          </span>
        </div>
        {branch ? (
          <div className="no-drag flex shrink-0 items-center gap-0.5 border-l border-line pl-1">
            <BranchRowActions
              variant="header"
              busy={busy?.refName === branch.refName ? busy.label : null}
              isRemote={branch.isRemote}
              isCurrent={branch.isHead}
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
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading && commits.length === 0 ? (
          <div className="px-2 py-2">
            <SkeletonRows rows={8} />
          </div>
        ) : commits.length === 0 ? (
          <EmptyState
            icon={GitCommitHorizontal}
            title={t("commits.emptyTitle")}
            description={t("commits.emptyDescription")}
          />
        ) : virtualized ? (
          <VirtualCommitList
            commits={commits}
            selectedSha={selectedSha}
            loading={loading}
            hasMore={hasMore}
            selectCommit={(sha) => void selectCommit(sha)}
            loadMore={() => void loadMore()}
            listKey={branch?.refName ?? (tag ? `refs/tags/${tag.name}` : "")}
          />
        ) : (
          <div className="h-full space-y-px overflow-y-auto px-2 py-2">
            {commits.map((commit) => (
              <CommitRow
                key={commit.sha}
                commit={commit}
                active={commit.sha === selectedSha}
                onSelect={() => void selectCommit(commit.sha)}
              />
            ))}

            {hasMore ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[11.5px] font-medium text-ink-soft transition-colors hover:bg-ink/4 hover:text-ink disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      {t("commits.loading")}
                    </>
                  ) : (
                    t("commits.loadMore")
                  )}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {dialogs}
    </section>
  );
}