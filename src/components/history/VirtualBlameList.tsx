import { useMemo } from "react";
import { List, useDynamicRowHeight } from "react-window";
import type { RowComponentProps } from "react-window";

import { useT } from "../../i18n";
import { absoluteTime, relativeTime } from "../../lib/format";
import type { BlameHunk } from "../../lib/types";
import { tip } from "../common/Tooltip";

/** Estimated row height; real heights are measured (lines wrap in narrow panes). */
const ESTIMATED_ROW_HEIGHT = 22;
/** Rows left below the viewport before the next blame window is requested. */
const PREFETCH_ROWS = 40;

interface RowProps {
  lines: string[];
  lineHunks: Array<BlameHunk | null>;
  onSelectCommit: (sha: string) => void;
  uncommittedLabel: string;
}

function BlameRow({
  index,
  style,
  lines,
  lineHunks,
  onSelectCommit,
  uncommittedLabel,
}: RowComponentProps<RowProps>) {
  const hunk = lineHunks[index] ?? null;
  const text = lines[index] ?? "";
  // Metadata is rendered once per hunk, like `git blame` does.
  const startsHunk = hunk !== null && (index === 0 || lineHunks[index - 1] !== hunk);
  const uncommitted = hunk?.commitSha === null;

  const tooltip = hunk
    ? `${hunk.authorName} <${hunk.authorEmail}> · ${absoluteTime(hunk.time)}\n${hunk.summary}`
    : undefined;

  return (
    <div
      style={style}
      className="flex items-start border-b border-line/40 font-mono text-[11px] hover:bg-ink/4"
    >
      <span className="w-[172px] shrink-0 self-stretch border-r border-line/50 px-2">
        {startsHunk && hunk ? (
          uncommitted ? (
            <span className="block truncate pt-[3px] text-[10px] italic text-ink-faint">
              {uncommittedLabel}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (hunk.commitSha) onSelectCommit(hunk.commitSha);
              }}
              className="block w-full truncate pt-[3px] text-left text-[10px] text-ink-faint transition-colors hover:text-accent"
              {...tip(tooltip ?? hunk.summary)}
            >
              <span className="text-accent/80">{hunk.shortSha}</span> {hunk.authorName}{" "}
              {relativeTime(hunk.time)}
            </button>
          )
        ) : null}
      </span>
      <span className="w-11 shrink-0 select-none pr-2 pt-[3px] text-right text-[10px] text-ink-faint/80">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words px-2 pt-[3px] pb-[3px] text-ink">
        {text}
      </span>
    </div>
  );
}

interface VirtualBlameListProps {
  hunks: BlameHunk[];
  lines: string[];
  loadedTo: number;
  totalLines: number;
  loaded: boolean;
  onLoadMore: () => void;
  onSelectCommit: (sha: string) => void;
  /** Changing this drops the measured row heights (other file / revision). */
  listKey: string;
}

/**
 * Per-line blame list. Only the loaded window(s) are rows; the next window is
 * requested shortly before the user reaches the end, so scrolling a large file
 * never stalls on a full-file blame.
 */
export default function VirtualBlameList({
  hunks,
  lines,
  loadedTo,
  totalLines,
  loaded,
  onLoadMore,
  onSelectCommit,
  listKey,
}: VirtualBlameListProps) {
  const t = useT();
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: ESTIMATED_ROW_HEIGHT,
    key: listKey,
  });

  const lineHunks = useMemo(() => {
    const map: Array<BlameHunk | null> = new Array(loadedTo).fill(null);
    for (const hunk of hunks) {
      const from = Math.max(0, hunk.startLine - 1);
      const to = Math.min(loadedTo, hunk.startLine - 1 + hunk.lines);
      for (let index = from; index < to; index += 1) map[index] = hunk;
    }
    return map;
  }, [hunks, loadedTo]);

  const rowProps = useMemo<RowProps>(
    () => ({
      lines,
      lineHunks,
      onSelectCommit,
      uncommittedLabel: t("fileHistory.blameUncommitted"),
    }),
    [lines, lineHunks, onSelectCommit, t],
  );

  if (loaded && loadedTo === 0) return null;

  return (
    <List
      className="h-full"
      style={{ height: "100%" }}
      defaultHeight={520}
      rowCount={loadedTo}
      rowHeight={rowHeight}
      rowProps={rowProps}
      rowComponent={BlameRow}
      overscanCount={12}
      onRowsRendered={({ stopIndex }) => {
        if (loadedTo < totalLines && stopIndex >= loadedTo - PREFETCH_ROWS) onLoadMore();
      }}
    />
  );
}