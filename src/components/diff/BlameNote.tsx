import { useT } from "../../i18n";
import { relativeTime } from "../../lib/format";
import type { InlineBlameLine } from "../../lib/inlineBlame";
import { tip } from "../common/Tooltip";

/**
 * The dim trail after a code line: who last touched it, and — on the first line
 * of a run — what that commit was about. `select-none` keeps the text out of a
 * copy of the code, and the tooltip carries the fields there is no room for.
 */
export default function BlameNote({ line }: { line: InlineBlameLine | undefined }) {
  const t = useT();
  if (!line) return null;

  const uncommitted = line.commitSha === null;
  const label = uncommitted
    ? t("diff.blameUncommitted")
    : `${line.authorName} · ${relativeTime(line.time)}`;
  const detail = uncommitted
    ? t("diff.blameUncommitted")
    : `${line.shortSha} · ${line.authorName} <${line.authorEmail}>\n${line.summary}`;

  return (
    <span
      {...tip(detail)}
      className="ml-6 inline-block max-w-[320px] select-none overflow-hidden truncate align-bottom text-[10px] text-ink-faint/70"
    >
      {label}
      {!uncommitted && line.startsHunk && line.summary ? ` · ${line.summary}` : ""}
    </span>
  );
}