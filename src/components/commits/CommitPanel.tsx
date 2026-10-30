import { ChevronLeft, GitBranch, GitCommitHorizontal, Loader2 } from "lucide-react";

import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import { SkeletonRows } from "../common/Skeleton";
import CommitRow from "./CommitRow";
import VirtualCommitList from "./VirtualCommitList";

/** Above this many rows the history is virtualised. */
const VIRTUALIZE_AFTER = 40;

export default function CommitPanel() {
  const {
    project,
    branch,
    commits,
    loading,
    hasMore,
    selectedSha,
  } = useSlice((state) => ({
    project: state.activeProject,
    branch: state.selectedBranch,
    commits: state.commits,
    loading: state.commitsLoading,
    hasMore: state.commitsHasMore,
    selectedSha: state.selectedCommitSha,
  }));

  const selectCommit = useAppStore((state) => state.selectCommit);
  const loadMore = useAppStore((state) => state.loadMoreCommits);
  const backToBranches = useAppStore((state) => state.backToBranches);
  const virtualized = commits.length >= VIRTUALIZE_AFTER;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-2"
      >
        <IconButton label="返回分支列表 (Esc)" onClick={backToBranches}>
          <ChevronLeft size={16} />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px]">
          <span className="truncate text-ink-faint">{project?.name}</span>
          <span className="shrink-0 text-line-strong">/</span>
          <span className="flex min-w-0 items-center gap-1 font-mono text-[11.5px] font-medium text-ink">
            <GitBranch size={11} className="shrink-0 text-ink-faint" />
            <span className="truncate">{branch?.name ?? "提交历史"}</span>
          </span>
        </div>
        <span className="shrink-0 pr-1 text-[10.5px] text-ink-faint">
          {commits.length}
          {hasMore ? "+" : ""} 次提交
        </span>
      </header>

      <div
        className={`min-h-0 flex-1 px-2 py-2 ${virtualized ? "overflow-hidden" : "overflow-y-auto"}`}
      >
        {loading && commits.length === 0 ? (
          <SkeletonRows rows={8} />
        ) : commits.length === 0 ? (
          <EmptyState
            icon={GitCommitHorizontal}
            title="该分支还没有提交"
            description="推送或创建首个提交后，这里会按时间倒序展示。"
          />
        ) : virtualized ? (
          <VirtualCommitList
            commits={commits}
            selectedSha={selectedSha}
            loading={loading}
            hasMore={hasMore}
            selectCommit={(sha) => void selectCommit(sha)}
            loadMore={() => void loadMore()}
            listKey={branch?.refName ?? ""}
          />
        ) : (
          <div className="space-y-px">
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
                      加载中
                    </>
                  ) : (
                    "加载更多提交"
                  )}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}