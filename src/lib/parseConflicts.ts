/**
 * Conflict-marker parsing for the resolver view.
 *
 * The parser never copies the file text: blocks only carry line indices into the
 * single `lines` array, so a 40k-line file costs one string array no matter how
 * many conflict blocks it contains.
 */

export interface ConflictBlock {
  /** Stable id inside one parsed file (`c1`, `c2`, …) — the draft key. */
  id: string;
  /** Line index of the `<<<<<<<` marker. */
  start: number;
  /** Line index of the `>>>>>>>` marker (or the last line of a truncated block). */
  end: number;
  oursLabel: string | null;
  theirsLabel: string | null;
  /** `[from, to)` indices into `lines` for our side. */
  ours: [number, number];
  /** `[from, to)` indices into `lines` for their side. */
  theirs: [number, number];
  /** `[from, to)` indices of the `|||||||` ancestor section, when present. */
  base: [number, number] | null;
}

export interface ParsedConflictFile {
  lines: string[];
  blocks: ConflictBlock[];
  /** Line ending to restore when writing the result back. */
  eol: "\n" | "\r\n";
  /** The worktree file still carried at least one complete marker block. */
  hasMarkers: boolean;
  /** A marker was opened but never closed (hand-edited file). */
  malformed: boolean;
  /** Whether the original file ended with a newline. */
  trailingNewline: boolean;
}

/**
 * Four marker kinds, matched strictly: text that merely *starts* with seven
 * characters (a Markdown `=======` underline, for instance) must not be read as
 * a conflict.
 */
const OURS_START = /^<{7}(?: |\t|$)/;
const BASE_START = /^\|{7}(?: |\t|$)/;
const SEPARATOR = /^={7}$/;
const THEIRS_END = /^>{7}(?: |\t|$)/;

function labelAfter(line: string, count: number): string | null {
  const label = line.slice(count).trim();
  return label.length > 0 ? label : null;
}

function markerLabel(line: string): string | null {
  return labelAfter(line, 7);
}

export function detectEol(text: string): "\n" | "\r\n" {
  const crlf = text.split("\r\n").length - 1;
  if (crlf === 0) return "\n";
  const lf = text.split("\n").length - 1;
  return crlf * 2 >= lf ? "\r\n" : "\n";
}

export function parseConflictFile(text: string): ParsedConflictFile {
  const eol = detectEol(text);
  const normalized = eol === "\r\n" ? text.replace(/\r\n/g, "\n") : text;
  const trailingNewline = normalized.endsWith("\n");
  // A trailing newline would add an empty last line to every render pass, but a
  // file that only contains "\n" still has one (empty) line.
  const body = trailingNewline ? normalized.slice(0, -1) : normalized;
  const lines = body.length === 0 ? (trailingNewline ? [""] : []) : body.split("\n");

  const blocks: ConflictBlock[] = [];
  let malformed = false;
  let index = 0;
  let counter = 0;

  while (index < lines.length) {
    if (!OURS_START.test(lines[index])) {
      index += 1;
      continue;
    }

    const start = index;
    const oursLabel = markerLabel(lines[index]);
    let cursor = index + 1;
    let baseStart: number | null = null;
    let baseEnd: number | null = null;
    let separator: number | null = null;

    while (cursor < lines.length) {
      const line = lines[cursor];
      if (separator === null && baseStart === null && BASE_START.test(line)) {
        baseStart = cursor + 1;
      } else if (separator === null && SEPARATOR.test(line)) {
        separator = cursor;
        if (baseStart !== null) baseEnd = cursor;
      } else if (separator !== null && THEIRS_END.test(line)) {
        break;
      }
      cursor += 1;
    }

    const hasEnd = cursor < lines.length && THEIRS_END.test(lines[cursor]);
    if (separator === null || !hasEnd) {
      // Do not swallow the rest of the file into a block we cannot close: leave
      // the remaining lines untouched and let the user edit them by hand.
      malformed = true;
      index = cursor < lines.length ? cursor + 1 : lines.length;
      continue;
    }

    counter += 1;
    blocks.push({
      id: `c${counter}`,
      start,
      end: cursor,
      oursLabel,
      theirsLabel: markerLabel(lines[cursor]),
      ours: [start + 1, baseStart === null ? separator : baseStart - 1],
      base: baseStart !== null && baseEnd !== null ? [baseStart, baseEnd] : null,
      theirs: [separator + 1, cursor],
    });
    index = cursor + 1;
  }

  return {
    lines,
    blocks,
    eol,
    hasMarkers: blocks.length > 0,
    malformed,
    trailingNewline,
  };
}

/** Text of a `[from, to)` range; never copies more than that range. */
export function sliceLines(lines: string[], range: [number, number]): string[] {
  const [from, to] = range;
  if (to <= from) return [];
  return lines.slice(from, Math.min(to, lines.length));
}

/**
 * Build the file that gets written back and staged.
 *
 * Resolved blocks use their draft verbatim; unresolved blocks keep their marker
 * lines so a partial save is never silently lossy.
 */
export function assembleConflictFile(
  parsed: ParsedConflictFile,
  drafts: Record<string, string>,
): { content: string; unresolved: number } {
  const out: string[] = [];
  let unresolved = 0;
  let index = 0;
  const byStart = new Map(parsed.blocks.map((block) => [block.start, block]));

  while (index < parsed.lines.length) {
    const block = byStart.get(index);
    if (!block) {
      out.push(parsed.lines[index]);
      index += 1;
      continue;
    }
    const draft = drafts[block.id];
    if (draft === undefined) {
      unresolved += 1;
      for (let line = block.start; line <= block.end; line += 1) out.push(parsed.lines[line]);
    } else if (draft.length > 0) {
      out.push(...draft.split("\n"));
    }
    index = block.end + 1;
  }

  const body = out.join("\n");
  // Keep the original trailing newline: dropping it would show up as a spurious
  // "no newline at end of file" change on every resolution.
  const content = parsed.trailingNewline ? `${body}\n` : body;
  const normalized = parsed.eol === "\r\n" ? content.replace(/\n/g, "\r\n") : content;
  return { content: normalized, unresolved };
}

/** Draft text for one quick choice. */
export function draftForChoice(
  parsed: ParsedConflictFile,
  block: ConflictBlock,
  choice: "ours" | "theirs" | "both" | "bothReverse",
): string {
  const ours = sliceLines(parsed.lines, block.ours);
  const theirs = sliceLines(parsed.lines, block.theirs);
  const order =
    choice === "ours"
      ? ours
      : choice === "theirs"
        ? theirs
        : choice === "both"
          ? [...ours, ...theirs]
          : [...theirs, ...ours];
  return order.join("\n");
}