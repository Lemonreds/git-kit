import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { List, useDynamicRowHeight } from "react-window";
import type { RowComponentProps } from "react-window";

import type { CommitSummary } from "../../lib/types";
import CommitRow from "./CommitRow";

interface RowProps {
  commits: CommitSummary[];
  selectedSha: string | null;
  loading: boolean;
  selectCommit: (sha: string) => void;
  loadMore: () => void;
}

/** Row heights vary: a summary can wrap to two lines. Measure instead of guess. */
const ESTIMATED_ROW_HEIGHT = 58;

function CommitListRow({
  index,
  style,
  commits,
  selectedSha,
  loading,
  selectCommit,
  loadMore,
}: RowComponentProps<RowProps>) {
  if (index >= commits.length) {
    return (
      <div style={style} className="pt-2">
        <button
          type="button"
          onClick={loadMore}
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
    );
  }

  const commit = commits[index];
  return (
    <div style={style} className="pb-px">
      <CommitRow
        commit={commit}
        active={commit.sha === selectedSha}
        onSelect={() => selectCommit(commit.sha)}
      />
    </div>
  );
}

interface VirtualCommitListProps {
  commits: CommitSummary[];
  selectedSha: string | null;
  loading: boolean;
  hasMore: boolean;
  selectCommit: (sha: string) => void;
  loadMore: () => void;
  /** Changing this drops the measured row heights (branch switch). */
  listKey: string;
}

/**
 * Virtualised commit history: "加载更多" can grow the list to thousands of rows,
 * but only the visible ones are mounted.
 */
export default function VirtualCommitList({
  commits,
  selectedSha,
  loading,
  hasMore,
  selectCommit,
  loadMore,
  listKey,
}: VirtualCommitListProps) {
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: ESTIMATED_ROW_HEIGHT,
    key: listKey,
  });
  const rowProps = useMemo<RowProps>(
    () => ({ commits, selectedSha, loading, selectCommit, loadMore }),
    [commits, selectedSha, loading, selectCommit, loadMore],
  );

  return (
    <List
      className="h-full"
      style={{ height: "100%" }}
      defaultHeight={520}
      rowCount={commits.length + (hasMore ? 1 : 0)}
      rowHeight={rowHeight}
      rowProps={rowProps}
      rowComponent={CommitListRow}
      overscanCount={6}
    />
  );
}