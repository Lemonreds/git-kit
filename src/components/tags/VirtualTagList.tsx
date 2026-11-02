import { useMemo } from "react";
import type { ReactNode } from "react";
import { List, useDynamicRowHeight } from "react-window";
import type { RowComponentProps } from "react-window";

import type { TagInfo } from "../../lib/types";

/**
 * One line of the tag pane. The paging footer ("load more") is a list item too,
 * so the rows and the footer share a single virtualised scroll container and
 * the footer sits at the very end of the scroll rather than in a fixed strip.
 */
export type TagListEntry =
  | { kind: "row"; tag: TagInfo }
  | { kind: "node"; key: string; node: ReactNode };

interface RowProps {
  entries: TagListEntry[];
  renderTag: (tag: TagInfo) => ReactNode;
}

/** Only used until a row has been measured; tag rows are ~58 px tall. */
const ESTIMATED_ROW_HEIGHT = 58;

function TagListRow({ index, style, entries, renderTag }: RowComponentProps<RowProps>) {
  const entry = entries[index];
  if (!entry) return null;

  if (entry.kind === "node") {
    return <div style={style}>{entry.node}</div>;
  }

  return (
    <div style={style} className="pb-px">
      {renderTag(entry.tag)}
    </div>
  );
}

interface VirtualTagListProps {
  entries: TagListEntry[];
  renderTag: (tag: TagInfo) => ReactNode;
  /** Changing this drops the measured row heights (project / filter / page switch). */
  listKey: string;
}

/**
 * Virtualised tag list. Release-heavy repositories carry hundreds of tags, and
 * only the visible rows need to exist in the DOM. Rows and the paging footer
 * have different heights, so heights are measured per row instead of assumed.
 */
export default function VirtualTagList({ entries, renderTag, listKey }: VirtualTagListProps) {
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: ESTIMATED_ROW_HEIGHT,
    key: listKey,
  });
  const rowProps = useMemo<RowProps>(() => ({ entries, renderTag }), [entries, renderTag]);

  return (
    <List
      // Padding lives on the scroller itself (not on a padded parent), so the
      // scrollbar sits flush against the pane edge — same as the plain lists.
      className="h-full px-2 pb-3 pt-1"
      style={{ height: "100%" }}
      defaultHeight={480}
      rowCount={entries.length}
      rowHeight={rowHeight}
      rowProps={rowProps}
      rowComponent={TagListRow}
      overscanCount={8}
    />
  );
}