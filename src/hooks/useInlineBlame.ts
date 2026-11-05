import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  ensureInlineBlame,
  inlineBlameLines,
  inlineBlameVersion,
  subscribeInlineBlame,
} from "../lib/inlineBlame";
import type { InlineBlameLine } from "../lib/inlineBlame";

interface InlineBlameOptions {
  enabled: boolean;
  repoPath: string | null;
  path: string | null;
  /** Commit whose version is shown; `null` = the working tree. */
  rev: string | null;
  /** Highest new-side line number the view renders right now. */
  maxLine: number;
}

/** Attribution for the lines currently rendered, or `null` when disabled. */
export function useInlineBlame({
  enabled,
  repoPath,
  path,
  rev,
  maxLine,
}: InlineBlameOptions): Map<number, InlineBlameLine> | null {
  const version = useSyncExternalStore(subscribeInlineBlame, inlineBlameVersion);

  useEffect(() => {
    if (!enabled || !repoPath || !path || maxLine <= 0) return undefined;
    // Debounced: opening a commit walks through files quickly, and each file
    // only needs one round of blame once the user actually looks at it.
    const timer = window.setTimeout(() => {
      void ensureInlineBlame(repoPath, path, rev, maxLine).catch(() => undefined);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [enabled, repoPath, path, rev, maxLine, version]);

  return useMemo(
    () => (enabled && path ? inlineBlameLines(rev, path, maxLine) : null),
    [enabled, path, rev, maxLine, version],
  );
}