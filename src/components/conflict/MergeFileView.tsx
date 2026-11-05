import { useEffect, useMemo, useState } from "react";

import { useT } from "../../i18n";
import type { ConflictBlock, ParsedConflictFile } from "../../lib/parseConflicts";
import type { ConflictChoice, ConflictDrafts } from "../../store/slices/conflictSlice";
import ConflictHunk from "./ConflictHunk";

/** Segments rendered per chunk: a file with 200 conflicts stays usable. */
const SEGMENT_STEP = 24;
/** Context lines rendered when a folded run is expanded. */
const CONTEXT_CAP = 300;

type Segment =
  | { kind: "context"; from: number; to: number }
  | { kind: "hunk"; block: ConflictBlock; index: number };

interface MergeFileViewProps {
  parsed: ParsedConflictFile;
  drafts: ConflictDrafts;
  oursLabel: string;
  theirsLabel: string;
  onChoose: (blockId: string, choice: ConflictChoice) => void;
  onChange: (blockId: string, text: string) => void;
  onReset: (blockId: string) => void;
  onAddLine: (blockId: string, side: "ours" | "theirs", line: number) => void;
}

function buildSegments(parsed: ParsedConflictFile): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  parsed.blocks.forEach((block, position) => {
    if (block.start > cursor) segments.push({ kind: "context", from: cursor, to: block.start });
    segments.push({ kind: "hunk", block, index: position + 1 });
    cursor = block.end + 1;
  });
  if (cursor < parsed.lines.length) {
    segments.push({ kind: "context", from: cursor, to: parsed.lines.length });
  }
  return segments;
}

/**
 * The whole file as one continuous, monospace document: untouched lines stay
 * where they are, and every conflict becomes an inline region with its own code
 * lens. That is the difference to the old card layout — the user reads the file
 * instead of a stack of boxes.
 *
 * Only presentational: drafts, saving and staging stay in `conflictSlice`.
 */
export default function MergeFileView({
  parsed,
  drafts,
  oursLabel,
  theirsLabel,
  onChoose,
  onChange,
  onReset,
  onAddLine,
}: MergeFileViewProps) {
  const t = useT();
  const segments = useMemo(() => buildSegments(parsed), [parsed]);
  const [limit, setLimit] = useState(SEGMENT_STEP);

  // A different file starts at the top again.
  useEffect(() => {
    setLimit(SEGMENT_STEP);
  }, [parsed]);

  return (
    <div className="min-w-max font-mono text-[11.5px] leading-[1.65]">
      {segments.slice(0, limit).map((segment) =>
        segment.kind === "context" ? (
          <ContextBlock
            key={`ctx-${segment.from}`}
            lines={parsed.lines}
            from={segment.from}
            to={segment.to}
          />
        ) : (
          <ConflictHunk
            key={segment.block.id}
            block={segment.block}
            index={segment.index}
            parsed={parsed}
            draft={drafts[segment.block.id]}
            oursLabel={oursLabel}
            theirsLabel={theirsLabel}
            onChoose={(choice) => onChoose(segment.block.id, choice)}
            onChange={(text) => onChange(segment.block.id, text)}
            onReset={() => onReset(segment.block.id)}
            onAddLine={(side, line) => onAddLine(segment.block.id, side, line)}
          />
        ),
      )}

      {limit < segments.length ? (
        <button
          type="button"
          onClick={() => setLimit((current) => current + SEGMENT_STEP)}
          className="my-1 w-full rounded-md border border-line py-1.5 font-sans text-[11px] text-ink-soft transition-colors hover:bg-ink/4 hover:text-ink"
        >
          {t("conflict.showMore", { remaining: segments.length - limit })}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Untouched lines between two conflicts. Long runs fold into one row so a file
 * with two conflicts 3000 lines apart does not become a scroll marathon.
 */
function ContextBlock({ lines, from, to }: { lines: string[]; from: number; to: number }) {
  const t = useT();
  const count = Math.max(0, to - from);
  const [expanded, setExpanded] = useState(count <= 12);

  if (count === 0) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-1.5 border-y border-transparent bg-canvas/40 px-2 py-0.5 text-left text-[10px] text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink-soft"
      >
        <span className="tracking-[0.15em]">···</span>
        <span>{t("conflict.contextCollapsed", { count })}</span>
      </button>
    );
  }

  const visible = Math.min(count, CONTEXT_CAP);
  return (
    <div>
      {Array.from({ length: visible }, (_, offset) => (
        <div key={from + offset} className="flex w-max min-w-full items-start hover:bg-ink/4">
          <span className="w-11 shrink-0 select-none pr-2 text-right text-[9.5px] leading-[1.8] text-ink-faint/70">
            {from + offset + 1}
          </span>
          <span className="whitespace-pre pr-2 text-ink-faint">{lines[from + offset] || " "}</span>
        </div>
      ))}
      {count > 4 ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full py-0.5 text-left text-[10px] text-ink-faint transition-colors hover:text-ink-soft"
        >
          <span className="pl-2">{t("conflict.contextCollapse")}</span>
          {count > CONTEXT_CAP ? ` · ${t("conflict.contextCapped", { count: CONTEXT_CAP })}` : ""}
        </button>
      ) : null}
    </div>
  );
}