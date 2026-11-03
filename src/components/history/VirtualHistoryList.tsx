import { useEffect, useMemo, useRef, useState } from "react";
import { List } from "react-window";
import type { RowComponentProps } from "react-window";

import { relativeTime, timeTooltip } from "../../lib/format";
import type { FileHistoryEntry } from "../../lib/types";
import { tip } from "../common/Tooltip";

const ROW_HEIGHT = 48;

interface RowProps {
  entries: FileHistoryEntry[];
  selectedSha: string | null;
  onSelect: (sha: string) => void;
}

function HistoryRow({
  index,
  style,
  entries,
  selectedSha,
  onSelect,
}: RowComponentProps<RowProps>) {
  const entry = entries[index];
  if (!entry) return null;
  const active = entry.sha === selectedSha;

  return (
    <div style={style} className="pb-px">
      <button
        type="button"
        onClick={() => onSelect(entry.sha)}
        aria-current={active ? "true" : undefined}
        className={`flex h-full w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
          active ? "bg-accent-soft" : "hover:bg-ink/4"
        }`}
      >
        <span
          className={`mt-px shrink-0 rounded px-1 py-px font-mono text-[9.5px] ${
            active ? "bg-accent/15 text-accent" : "bg-ink/6 text-ink-faint"
          }`}
        >
          {entry.shortSha}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[11.5px] ${active ? "font-medium text-ink" : "text-ink-soft"}`}
            {...tip(entry.summary || entry.sha)}
          >
            {entry.summary || entry.sha}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-ink-faint">
            <span className="truncate">{entry.authorName}</span>
            <span>·</span>
            <span {...tip(timeTooltip(entry.committedAt))}>{relativeTime(entry.committedAt)}</span>
          </span>
        </span>
      </button>
    </div>
  );
}

interface VirtualHistoryListProps {
  entries: FileHistoryEntry[];
  selectedSha: string | null;
  onSelect: (sha: string) => void;
}

/**
 * Commit rows of one file. Fixed-height rows: a long summary is clipped instead
 * of wrapped, so the list stays scannable and the virtualizer needs no measuring.
 */
export default function VirtualHistoryList({
  entries,
  selectedSha,
  onSelect,
}: VirtualHistoryListProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(180);

  // The list lives in a `max-h` box: measure the wrapper instead of guessing a
  // default that would either leave a gap or clip the last visible row.
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return undefined;
    const update = () => setHeight(element.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rowProps = useMemo<RowProps>(
    () => ({ entries, selectedSha, onSelect }),
    [entries, selectedSha, onSelect],
  );

  return (
    <div ref={wrapperRef} className="h-full min-h-0">
      <List
        className="px-2 py-1"
        style={{ height }}
        defaultHeight={180}
        rowCount={entries.length}
        rowHeight={ROW_HEIGHT}
        rowProps={rowProps}
        rowComponent={HistoryRow}
        overscanCount={4}
      />
    </div>
  );
}