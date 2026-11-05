import { Plus } from "lucide-react";

import { useT } from "../../i18n";
import { tip } from "../common/Tooltip";

type SideTone = "ours" | "theirs" | "base";

/**
 * Current change = the version on this branch (green), incoming = the version
 * being merged in (blue). Green / red stay out of this: an incoming line is not
 * an error, it is just the other side.
 */
const TONE: Record<SideTone, { badge: string; line: string; edge: string; head: string }> = {
  ours: {
    badge: "bg-positive/14 text-positive",
    line: "bg-positive/[0.06]",
    edge: "border-l-2 border-l-positive/60",
    head: "bg-positive/[0.09]",
  },
  theirs: {
    badge: "bg-accent/14 text-accent",
    line: "bg-accent/[0.06]",
    edge: "border-l-2 border-l-accent/60",
    head: "bg-accent/[0.09]",
  },
  base: {
    badge: "bg-ink/8 text-ink-faint",
    line: "",
    edge: "border-l-2 border-l-line-strong",
    head: "",
  },
};

interface ConflictSidePanelProps {
  title: string;
  /** Revision / branch the side comes from (`HEAD`, a branch, a sha). */
  caption?: string | null;
  tone: SideTone;
  lines: string[];
  /** `[from, to)` range of this side inside `lines`. */
  range: [number, number];
  /** Omitted for the read-only ancestor section. */
  onAddLine?: (line: number) => void;
}

/**
 * One side of a conflict block, rendered like an editor pane: a tinted title bar
 * with the revision it comes from, line numbers and the code itself. Long lines
 * scroll horizontally inside the pane so the block keeps a predictable height.
 */
export default function ConflictSidePanel({
  title,
  caption,
  tone,
  lines,
  range,
  onAddLine,
}: ConflictSidePanelProps) {
  const t = useT();
  const [from, to] = range;
  const count = Math.max(0, to - from);
  const palette = TONE[tone];

  return (
    <div
      className={`flex min-w-[220px] flex-1 flex-col overflow-hidden rounded-lg border border-line bg-canvas/40 ${palette.edge}`}
    >
      <div
        className={`flex shrink-0 items-center gap-1.5 border-b border-line px-2 py-1 ${palette.head}`}
      >
        <span className={`rounded px-1 py-px text-[9.5px] font-semibold ${palette.badge}`}>
          {title}
        </span>
        {caption ? (
          <span className="min-w-0 truncate font-mono text-[9.5px] text-ink-faint" {...tip(caption)}>
            {caption}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 font-mono text-[9.5px] text-ink-faint">
          {t("diff.lineCount", { count })}
        </span>
      </div>

      <div className="max-h-[190px] min-h-[36px] overflow-auto">
        {count === 0 ? (
          <p className="px-2 py-2 text-[10.5px] italic text-ink-faint">
            {t("conflict.sideEmpty")}
          </p>
        ) : (
          <div className="min-w-max font-mono text-[11px] leading-[1.6]">
            {Array.from({ length: count }, (_, offset) => {
              const line = from + offset;
              return (
                <div key={line} className={`group flex items-start hover:bg-ink/6 ${palette.line}`}>
                  <span className="w-10 shrink-0 select-none pr-1.5 text-right text-[9.5px] leading-[1.75] text-ink-faint/80">
                    {line + 1}
                  </span>
                  <span className="whitespace-pre pr-1">{lines[line] ?? ""}</span>
                  {onAddLine ? (
                    <button
                      type="button"
                      onClick={() => onAddLine(line)}
                      aria-label={t("conflict.addLine")}
                      {...tip(t("conflict.addLine"))}
                      className="mt-px hidden h-4 w-4 shrink-0 place-items-center rounded bg-accent/15 text-accent transition-colors hover:bg-accent/25 group-hover:grid"
                    >
                      <Plus size={10} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
