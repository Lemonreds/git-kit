import { useState } from "react";
import { Check, Pencil, Plus, RotateCcw } from "lucide-react";

import { useT } from "../../i18n";
import { sliceLines } from "../../lib/parseConflicts";
import type { ConflictBlock, ParsedConflictFile } from "../../lib/parseConflicts";
import type { ConflictChoice } from "../../store/slices/conflictSlice";
import { tip } from "../common/Tooltip";

type SideTone = "ours" | "theirs";

/**
 * Current = the version on this branch (green), incoming = the version being
 * merged in (blue). Neither is an error, so neither side is tinted red.
 */
const SIDE: Record<SideTone, { badge: string; row: string; edge: string; head: string }> = {
  ours: {
    badge: "bg-positive/16 text-positive",
    row: "bg-positive/[0.055]",
    edge: "border-l-positive/70",
    head: "bg-positive/[0.09]",
  },
  theirs: {
    badge: "bg-accent/16 text-accent",
    row: "bg-accent/[0.055]",
    edge: "border-l-accent/70",
    head: "bg-accent/[0.09]",
  },
};

const LENS =
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors";

interface ConflictHunkProps {
  block: ConflictBlock;
  /** 1-based position of the block inside the file. */
  index: number;
  parsed: ParsedConflictFile;
  /** `undefined` = not resolved yet. */
  draft: string | undefined;
  oursLabel: string;
  theirsLabel: string;
  onChoose: (choice: ConflictChoice) => void;
  onChange: (text: string) => void;
  onReset: () => void;
  onAddLine: (side: SideTone, line: number) => void;
}

/**
 * One conflict region inside the continuous file view, laid out the way VS Code
 * shows it: a code lens with the accept actions on top, the current side above
 * the incoming side, and — once accepted — the resolved text in place of both.
 *
 * Choosing a side only fills the draft; the file is written when the user saves,
 * so trying the options never loses anything.
 */
export default function ConflictHunk({
  block,
  index,
  parsed,
  draft,
  oursLabel,
  theirsLabel,
  onChoose,
  onChange,
  onReset,
  onAddLine,
}: ConflictHunkProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const resolved = draft !== undefined;
  const ours = sliceLines(parsed.lines, block.ours);
  const theirs = sliceLines(parsed.lines, block.theirs);
  const base = block.base ? sliceLines(parsed.lines, block.base) : [];
  const baseFrom = block.base?.[0] ?? 0;
  const draftLines = resolved ? draft.split("\n") : [];

  return (
    <section
      className={`my-0.5 border-y ${
        resolved ? "border-positive/25 bg-positive/[0.02]" : "border-warning/25 bg-warning/[0.02]"
      }`}
    >
      {/* Code lens: the actions VS Code offers above a conflict region. */}
      <div className="flex w-max min-w-full flex-wrap items-center gap-x-1.5 gap-y-1 px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
          {t("conflict.blockIndex", { index })}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded px-1 py-px text-[9.5px] font-medium ${
            resolved ? "bg-positive/14 text-positive" : "bg-warning/16 text-warning"
          }`}
        >
          {resolved ? <Check size={9} /> : null}
          {resolved ? t("conflict.blockResolved") : t("conflict.blockUnresolved")}
        </span>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {resolved ? (
            <>
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                aria-pressed={editing}
                className={`${LENS} ${
                  editing
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-line text-ink-soft hover:bg-ink/5 hover:text-ink"
                }`}
              >
                <Pencil size={9} />
                {t("conflict.editBlock")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  onReset();
                }}
                className={`${LENS} border-line text-ink-faint hover:bg-ink/5 hover:text-ink`}
              >
                <RotateCcw size={9} />
                {t("conflict.resetBlock")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onChoose("ours")}
                className={`${LENS} border-positive/40 text-positive hover:bg-positive/10`}
              >
                {t("conflict.takeCurrent")}
              </button>
              <button
                type="button"
                onClick={() => onChoose("theirs")}
                className={`${LENS} border-accent/40 text-accent hover:bg-accent/10`}
              >
                {t("conflict.takeIncoming")}
              </button>
              <button
                type="button"
                onClick={() => onChoose("both")}
                className={`${LENS} border-line text-ink-soft hover:bg-ink/5 hover:text-ink`}
              >
                {t("conflict.keepBoth")}
              </button>
              <button
                type="button"
                onClick={() => onChoose("bothReverse")}
                {...tip(t("conflict.keepBothReverse"))}
                className={`${LENS} border-line text-ink-faint hover:bg-ink/5 hover:text-ink-soft`}
              >
                {t("conflict.keepBothShort")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Editing first: the sides stay below as reference while the result is
          typed, instead of pushing the box out of view. */}
      {resolved && editing ? (
        <div className="px-2 py-1.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => onChange(event.target.value)}
            placeholder={t("conflict.resultPlaceholder")}
            spellCheck={false}
            rows={Math.min(Math.max(draftLines.length, 3), 14)}
            className="w-full resize-y rounded-md border border-accent/40 bg-panel px-2 py-1 font-mono text-[11.5px] leading-[1.65] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
          />
        </div>
      ) : resolved ? (
        draftLines.length === 0 ? (
          <p className="px-2 py-1 text-[10.5px] italic text-ink-faint">{t("conflict.sideEmpty")}</p>
        ) : (
          draftLines.map((line, offset) => (
            <div
              key={`draft-${offset}`}
              className="flex w-max min-w-full items-start border-l-[3px] border-l-positive/40 bg-positive/[0.05]"
            >
              <Gutter label="·" />
              <span className="whitespace-pre pr-2 text-ink">{line || " "}</span>
            </div>
          ))
        )
      ) : null}

      {resolved && !editing ? null : (
        <>
          <SideBlock
            tone="ours"
            title={t("conflict.currentChange")}
            caption={oursLabel}
            lines={ours}
            from={block.ours[0]}
            onAddLine={(line) => onAddLine("ours", line)}
          />
          <SideBlock
            tone="theirs"
            title={t("conflict.incomingChange")}
            caption={theirsLabel}
            lines={theirs}
            from={block.theirs[0]}
            onAddLine={(line) => onAddLine("theirs", line)}
          />
        </>
      )}

      {base.length > 0 ? (
        <details className="px-2 pb-1.5">
          <summary className="cursor-pointer select-none rounded px-1 py-0.5 text-[10px] text-ink-faint transition-colors hover:text-ink-soft">
            {t("conflict.baseSide")} · {t("diff.lineCount", { count: base.length })}
          </summary>
          <div className="mt-1 border-l-[3px] border-l-line-strong bg-canvas/40">
            {base.map((line, offset) => (
              <div key={`base-${offset}`} className="flex w-max min-w-full items-start">
                <Gutter label={String(baseFrom + offset + 1)} />
                <span className="whitespace-pre pr-2 text-ink-faint">{line || " "}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** One side of the conflict, rendered as an uninterrupted run of code lines. */
function SideBlock({
  tone,
  title,
  caption,
  lines,
  from,
  onAddLine,
}: {
  tone: SideTone;
  title: string;
  caption?: string | null;
  lines: string[];
  /** Original 0-based line index of `lines[0]`. */
  from: number;
  onAddLine: (line: number) => void;
}) {
  const t = useT();
  const palette = SIDE[tone];

  return (
    <div className={`border-l-[3px] ${palette.edge}`}>
      <div className={`flex w-max min-w-full items-center gap-1.5 px-2 py-[3px] ${palette.head}`}>
        <span className={`rounded px-1 py-px text-[9.5px] font-semibold ${palette.badge}`}>
          {title}
        </span>
        {caption ? (
          <span className="max-w-[220px] truncate font-mono text-[9.5px] text-ink-faint" {...tip(caption)}>
            {caption}
          </span>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="px-2 py-1 text-[10.5px] italic text-ink-faint">{t("conflict.sideEmpty")}</p>
      ) : (
        lines.map((line, offset) => (
          <div
            key={`${tone}-${from + offset}`}
            className={`group flex w-max min-w-full items-start hover:bg-ink/6 ${palette.row}`}
          >
            <Gutter label={String(from + offset + 1)} />
            <span className="whitespace-pre pr-2 text-ink-soft">{line || " "}</span>
            <button
              type="button"
              onClick={() => onAddLine(from + offset)}
              aria-label={t("conflict.addLine")}
              {...tip(t("conflict.addLine"))}
              className="ml-1 mt-[3px] hidden h-4 w-4 shrink-0 place-items-center rounded bg-accent/15 text-accent transition-colors hover:bg-accent/25 group-hover:grid"
            >
              <Plus size={10} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/** The line-number column shared by every row so the code stays aligned. */
function Gutter({ label }: { label: string }) {
  return (
    <span className="w-11 shrink-0 select-none pr-2 text-right text-[9.5px] leading-[1.8] text-ink-faint/70">
      {label}
    </span>
  );
}