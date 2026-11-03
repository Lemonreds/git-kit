import { Check, RotateCcw } from "lucide-react";

import { useT } from "../../i18n";
import { sliceLines } from "../../lib/parseConflicts";
import type { ConflictBlock, ParsedConflictFile } from "../../lib/parseConflicts";
import type { ConflictChoice } from "../../store/slices/conflictSlice";
import ConflictSidePanel from "./ConflictSidePanel";

interface ConflictBlockCardProps {
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
  onAddLine: (side: "ours" | "theirs", line: number) => void;
}

/**
 * One `<<<<<<< … >>>>>>>` block: both sides, the ancestor (when diff3 markers
 * are present) and the editable result. Quick choices only fill the draft — the
 * file is written when the user saves, so nothing is lost by exploring options.
 */
export default function ConflictBlockCard({
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
}: ConflictBlockCardProps) {
  const t = useT();
  const resolved = draft !== undefined;
  const ours = sliceLines(parsed.lines, block.ours);
  const theirs = sliceLines(parsed.lines, block.theirs);
  const base = block.base ? sliceLines(parsed.lines, block.base) : [];

  const action = "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors";

  return (
    <section
      className={`overflow-hidden rounded-xl border bg-panel ${
        resolved ? "border-positive/35" : "border-warning/40"
      }`}
    >
      <header className="flex flex-wrap items-center gap-1.5 border-b border-line bg-canvas/50 px-2 py-1.5">
        <span className="text-[11px] font-semibold text-ink">
          {t("conflict.blockIndex", { index })}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded px-1 py-px text-[9.5px] font-medium ${
            resolved ? "bg-positive/12 text-positive" : "bg-warning/14 text-warning"
          }`}
        >
          {resolved ? <Check size={9} /> : null}
          {resolved ? t("conflict.blockResolved") : t("conflict.blockUnresolved")}
        </span>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onChoose("ours")}
            className={`${action} border-positive/35 text-positive hover:bg-positive/10`}
          >
            {t("conflict.takeOurs")}
          </button>
          <button
            type="button"
            onClick={() => onChoose("theirs")}
            className={`${action} border-negative/35 text-negative hover:bg-negative/10`}
          >
            {t("conflict.takeTheirs")}
          </button>
          <button
            type="button"
            onClick={() => onChoose("both")}
            className={`${action} border-line text-ink-soft hover:bg-ink/5 hover:text-ink`}
          >
            {t("conflict.takeBoth")}
          </button>
          <button
            type="button"
            onClick={() => onChoose("bothReverse")}
            className={`${action} border-line text-ink-soft hover:bg-ink/5 hover:text-ink`}
          >
            {t("conflict.takeBothReverse")}
          </button>
          {resolved ? (
            <button
              type="button"
              onClick={onReset}
              className={`${action} border-line text-ink-faint hover:bg-ink/5 hover:text-ink`}
            >
              <RotateCcw size={9} />
              {t("conflict.resetBlock")}
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-2 p-2">
        <ConflictSidePanel
          title={t("conflict.oursLabel", { label: oursLabel })}
          tone="ours"
          lines={parsed.lines}
          range={block.ours}
          onAddLine={(line) => onAddLine("ours", line)}
        />
        <ConflictSidePanel
          title={t("conflict.theirsLabel", { label: theirsLabel })}
          tone="theirs"
          lines={parsed.lines}
          range={block.theirs}
          onAddLine={(line) => onAddLine("theirs", line)}
        />
      </div>

      {block.base && base.length > 0 ? (
        <details className="px-2 pb-2">
          <summary className="cursor-pointer select-none rounded px-1 py-0.5 text-[10px] text-ink-faint transition-colors hover:text-ink-soft">
            {t("conflict.baseSide")} · {t("diff.lineCount", { count: base.length })}
          </summary>
          <div className="mt-1 rounded-lg border border-line bg-canvas/40 p-1">
            <ConflictSidePanel
              title={t("conflict.baseSide")}
              tone="base"
              lines={parsed.lines}
              range={block.base}
            />
          </div>
        </details>
      ) : null}

      <div className="border-t border-line px-2 py-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
            {t("conflict.result")}
          </span>
          <span className="font-mono text-[9.5px] text-ink-faint">
            {t("diff.lineCount", { count: draft === undefined ? 0 : draft.split("\n").length })}
          </span>
        </div>
        <textarea
          value={draft ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("conflict.resultPlaceholder")}
          spellCheck={false}
          rows={Math.min(Math.max(draft === undefined ? 3 : draft.split("\n").length, 3), 12)}
          className={`w-full resize-y rounded-lg border bg-canvas/60 px-2 py-1.5 font-mono text-[11px] leading-[1.6] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/50 ${
            resolved ? "border-positive/30" : "border-line"
          }`}
        />
        <p className="mt-1 text-[10px] text-ink-faint">
          {t("conflict.oursLineCount", { ours: ours.length, theirs: theirs.length })}
        </p>
      </div>
    </section>
  );
}