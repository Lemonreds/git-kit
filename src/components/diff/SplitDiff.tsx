import { Fragment } from "react";

import { useT } from "../../i18n";
import type { DiffLine, SplitRowItem } from "../../lib/parsePatch";
import DiffText from "./DiffText";

function tint(line: DiffLine | null): string {
  if (!line) return "split-cell--empty";
  if (line.type === "add") return "diff-cell--add text-positive";
  if (line.type === "del") return "diff-cell--del text-negative";
  return "text-ink";
}

export default function SplitDiff({
  rows,
  limit,
  query = "",
}: {
  rows: SplitRowItem[];
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
    <div className="split-grid">
      {rows.slice(0, limit).map((row, rowIndex) => {
        if (row.kind === "hunk") {
          return (
            <div key={rowIndex} className="diff-hunk col-span-4">
              {row.header}
            </div>
          );
        }

        const { left, right } = row;
        return (
          <Fragment key={rowIndex}>
            <span className={`line-number diff-cell py-0.5 ${tint(left)}`}>
              {left?.oldNumber ?? ""}
            </span>
            <span className={`split-cell border-r border-line/50 px-2 py-0.5 ${tint(left)}`}>
              {left ? <DiffText text={left.text} query={query} /> : null}
            </span>
            <span className={`line-number diff-cell py-0.5 ${tint(right)}`}>
              {right?.newNumber ?? ""}
            </span>
            <span className={`split-cell px-2 py-0.5 ${tint(right)}`}>
              {right ? <DiffText text={right.text} query={query} /> : null}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}