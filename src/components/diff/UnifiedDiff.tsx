import { Fragment } from "react";

import { useT } from "../../i18n";
import type { DiffLine, UnifiedRow } from "../../lib/parsePatch";
import DiffText from "./DiffText";

function tint(line: DiffLine | null): string {
  if (!line) return "";
  if (line.type === "add") return "diff-cell--add";
  if (line.type === "del") return "diff-cell--del";
  return "";
}

function textTone(line: DiffLine | null): string {
  if (!line) return "text-ink";
  if (line.type === "add") return "text-positive";
  if (line.type === "del") return "text-negative";
  return "text-ink";
}

function marker(line: DiffLine | null): string {
  if (!line) return " ";
  if (line.type === "add") return "+";
  if (line.type === "del") return "−";
  if (line.type === "meta") return "\\";
  return " ";
}

export default function UnifiedDiff({
  rows,
  limit,
  query = "",
}: {
  rows: UnifiedRow[];
  /** How many rows to render (the rest is hidden until the user scrolls). */
  limit: number;
  query?: string;
}) {
  const t = useT();
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-[12px] text-ink-faint">
        {t("diff.noLineChanges")}
      </p>
    );
  }

  return (
    <div className="diff-grid">
      {rows.slice(0, limit).map((row, rowIndex) => {
        if (row.kind === "hunk") {
          return (
            <div key={rowIndex} className="diff-hunk col-span-3">
              {row.header}
            </div>
          );
        }

        const line = row.line;
        return (
          <Fragment key={rowIndex}>
            <span className={`line-number diff-cell py-0.5 ${tint(line)}`}>{line.oldNumber ?? ""}</span>
            <span className={`line-number diff-cell py-0.5 ${tint(line)}`}>{line.newNumber ?? ""}</span>
            <span className={`diff-cell px-2 py-0.5 ${tint(line)} ${textTone(line)}`}>
              <span className="mr-1.5 inline-block w-2 select-none opacity-60">{marker(line)}</span>
              <DiffText text={line.text} query={query} />
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}