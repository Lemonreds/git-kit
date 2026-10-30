export type DiffLineType = "ctx" | "add" | "del" | "meta";

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldNumber: number | null;
  newNumber: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface ParsedPatch {
  hunks: DiffHunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const FILE_HEADER = /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|dissimilarity index|rename from|rename to|Binary files )/;

/**
 * Parse a unified diff (`git diff` / libgit2 patch format) into hunks.
 * File level headers are dropped — the UI already knows the path from the
 * commit file list.
 */
export function parsePatch(patch: string): ParsedPatch {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of patch.split("\n")) {
    if (rawLine.length === 0) continue;

    const hunkMatch = HUNK_HEADER.exec(rawLine);
    if (hunkMatch) {
      const oldStart = Number(hunkMatch[1]);
      const oldLines = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
      const newStart = Number(hunkMatch[3]);
      const newLines = hunkMatch[4] === undefined ? 1 : Number(hunkMatch[4]);
      current = { header: rawLine, oldStart, oldLines, newStart, newLines, lines: [] };
      hunks.push(current);
      oldLine = oldStart;
      newLine = newStart;
      continue;
    }

    if (!current) continue;
    if (FILE_HEADER.test(rawLine)) continue;

    if (rawLine.startsWith("\\")) {
      current.lines.push({ type: "meta", text: rawLine, oldNumber: null, newNumber: null });
      continue;
    }

    const marker = rawLine[0];
    const text = rawLine.slice(1);
    if (marker === "+") {
      current.lines.push({ type: "add", text, oldNumber: null, newNumber: newLine });
      newLine += 1;
    } else if (marker === "-") {
      current.lines.push({ type: "del", text, oldNumber: oldLine, newNumber: null });
      oldLine += 1;
    } else {
      current.lines.push({ type: "ctx", text, oldNumber: oldLine, newNumber: newLine });
      oldLine += 1;
      newLine += 1;
    }
  }

  return { hunks };
}

export interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

/** One rendered row of the unified view (hunk headers keep their own height). */
export type UnifiedRow =
  | { kind: "hunk"; header: string }
  | { kind: "line"; line: DiffLine };

/** One rendered row of the side-by-side view. */
export type SplitRowItem =
  | { kind: "hunk"; header: string }
  | { kind: "row"; left: DiffLine | null; right: DiffLine | null };

/**
 * Flatten hunks into the rows that get rendered, so the view can render a
 * window of them instead of the whole file. Built once per patch + mode.
 */
export function toUnifiedRows(hunks: DiffHunk[]): UnifiedRow[] {
  const rows: UnifiedRow[] = [];
  for (const hunk of hunks) {
    rows.push({ kind: "hunk", header: hunk.header });
    for (const line of hunk.lines) rows.push({ kind: "line", line });
  }
  return rows;
}

export function toSplitRowItems(hunks: DiffHunk[]): SplitRowItem[] {
  const rows: SplitRowItem[] = [];
  for (const hunk of hunks) {
    rows.push({ kind: "hunk", header: hunk.header });
    for (const row of toSplitRows(hunk)) {
      rows.push({ kind: "row", left: row.left, right: row.right });
    }
  }
  return rows;
}

/**
 * Pair deletions and additions inside a hunk so the two-column view stays read-
 * able: a run of `-` lines is aligned row by row with the following run of `+`
 * lines, context lines are shared by both sides.
 */
export function toSplitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = [];
  let deleted: DiffLine[] = [];
  let added: DiffLine[] = [];

  const flush = () => {
    const height = Math.max(deleted.length, added.length);
    for (let index = 0; index < height; index += 1) {
      rows.push({ left: deleted[index] ?? null, right: added[index] ?? null });
    }
    deleted = [];
    added = [];
  };

  for (const line of hunk.lines) {
    if (line.type === "del") {
      deleted.push(line);
    } else if (line.type === "add") {
      added.push(line);
    } else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();

  return rows;
}