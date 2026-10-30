import { useMemo } from "react";
import type { ReactNode } from "react";
import { List, useDynamicRowHeight } from "react-window";
import type { RowComponentProps } from "react-window";

import type { BranchSummary } from "../../lib/types";

/**
 * One line of the branch panel. Section headers ("远程分支 · …" with its
 * 加载更多/收起 buttons) are list items too, so local + remote branches share a
 * single virtualised scroll container. Their markup is owned by BranchPanel so
 * the virtualised and plain lists render exactly the same header.
 */
export type BranchListEntry =
  | { kind: "row"; branch: BranchSummary }
  | { kind: "node"; key: string; node: ReactNode };

interface RowProps {
  entries: BranchListEntry[];
  renderBranch: (branch: BranchSummary) => ReactNode;
}

/** Only used until a row has been measured; branch rows are ~48 px tall. */
const ESTIMATED_ROW_HEIGHT = 50;

function BranchListRow({ index, style, entries, renderBranch }: RowComponentProps<RowProps>) {
  const entry = entries[index];
  if (!entry) return null;

  if (entry.kind === "node") {
    return <div style={style}>{entry.node}</div>;
  }

  return (
    <div style={style} className="pb-px">
      {renderBranch(entry.branch)}
    </div>
  );
}

interface VirtualBranchListProps {
  entries: BranchListEntry[];
  renderBranch: (branch: BranchSummary) => ReactNode;
  /** Changing this drops the measured row heights (project / filter switch). */
  listKey: string;
}

/**
 * Virtualised branch list: with hundreds of branches only the visible rows are
 * mounted, which keeps the DOM (and the memory it holds) flat. Rows and section
 * headers have different heights, so heights are measured per row instead of
 * assumed.
 */
export default function VirtualBranchList({
  entries,
  renderBranch,
  listKey,
}: VirtualBranchListProps) {
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: ESTIMATED_ROW_HEIGHT,
    key: listKey,
  });
  const rowProps = useMemo<RowProps>(() => ({ entries, renderBranch }), [entries, renderBranch]);

  return (
    <List
      className="h-full"
      style={{ height: "100%" }}
      defaultHeight={480}
      rowCount={entries.length}
      rowHeight={rowHeight}
      rowProps={rowProps}
      rowComponent={BranchListRow}
      overscanCount={8}
    />
  );
}