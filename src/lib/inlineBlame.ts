/**
 * Inline blame (GitLens-style): who last touched each line of the file shown in
 * the diff view.
 *
 * The data comes from the same `git blame` windows the Blame tab uses, but the
 * view only ever needs what is on screen, so windows are fetched lazily, cached
 * per revision + path, and cleared whenever the repository state changes
 * (`invalidateCaches` in the store calls `clearInlineBlameCache`).
 */

import { api } from "./ipc";
import type { BlameWindow } from "./types";

export interface InlineBlameLine {
  commitSha: string | null;
  shortSha: string;
  authorName: string;
  authorEmail: string;
  time: number;
  summary: string;
  /** First line of the run — the commit summary is drawn only there. */
  startsHunk: boolean;
}

/** Lines requested per window, and the cap for one file view. */
export const INLINE_BLAME_WINDOW = 500;
export const INLINE_BLAME_MAX_LINES = 2500;
/** Blame output is small, but a long session can open many files. */
const CACHE_LIMIT = 32;

const windows = new Map<string, BlameWindow>();
/** Windows that already failed once; retrying on every render would spam git. */
const failed = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function cacheKey(rev: string | null, path: string, start: number): string {
  return `${rev ?? "worktree"}\u0000${path}\u0000${start}`;
}

function bump(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function inlineBlameVersion(): number {
  return version;
}

export function subscribeInlineBlame(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Repo state changed: every attribution may be stale. */
export function clearInlineBlameCache(): void {
  windows.clear();
  failed.clear();
  bump();
}

/** Lines per hunk, absolute and 1-based, as the diff's new-side numbers are. */
export function inlineBlameLines(
  rev: string | null,
  path: string,
  maxLine: number,
): Map<number, InlineBlameLine> | null {
  const limit = Math.min(Math.max(maxLine, 0), INLINE_BLAME_MAX_LINES);
  if (limit === 0) return null;

  let found = false;
  const map = new Map<number, InlineBlameLine>();
  for (let start = 1; start <= limit; start += INLINE_BLAME_WINDOW) {
    const window = windows.get(cacheKey(rev, path, start));
    if (!window) continue;
    found = true;
    for (const hunk of window.hunks) {
      for (let offset = 0; offset < hunk.lines; offset += 1) {
        const line = hunk.startLine + offset;
        if (line > limit) break;
        map.set(line, {
          commitSha: hunk.commitSha,
          shortSha: hunk.shortSha,
          authorName: hunk.authorName,
          authorEmail: hunk.authorEmail,
          time: hunk.time,
          summary: hunk.summary,
          startsHunk: offset === 0,
        });
      }
    }
  }
  return found ? map : null;
}

/**
 * Fetch the windows covering `1..maxLine` that are not cached yet.
 *
 * Never throws: a blame that fails (shallow clone, huge binary-ish file, …) is
 * remembered as failed and the diff simply renders without annotations.
 */
export async function ensureInlineBlame(
  repoPath: string,
  path: string,
  rev: string | null,
  maxLine: number,
): Promise<void> {
  const limit = Math.min(Math.max(maxLine, 0), INLINE_BLAME_MAX_LINES);
  if (limit === 0) return;

  const pending: number[] = [];
  for (let start = 1; start <= limit; start += INLINE_BLAME_WINDOW) {
    const key = cacheKey(rev, path, start);
    if (windows.has(key) || failed.has(key)) continue;
    pending.push(start);
  }
  if (pending.length === 0) return;

  await Promise.all(
    pending.map(async (start) => {
      const key = cacheKey(rev, path, start);
      const end = Math.min(start + INLINE_BLAME_WINDOW - 1, limit);
      try {
        const window = await api.fileBlame(repoPath, path, start, end, rev);
        windows.set(key, window);
        if (windows.size > CACHE_LIMIT) {
          const oldest = windows.keys().next();
          if (!oldest.done) windows.delete(oldest.value);
        }
      } catch {
        failed.add(key);
      }
    }),
  );
  bump();
}