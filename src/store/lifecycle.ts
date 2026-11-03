import { useEffect } from "react";

import { setTerminalsWindowHidden } from "../lib/terminal";
import { useAppStore } from "./appStore";
import { releaseTransientCaches } from "./shared";

/**
 * Memory hygiene for a long-running desktop window.
 *
 * When the window is hidden (⌘H, another app in front, screen locked) the user
 * cannot see any rendered diff, so the cached file lists and patches are just
 * held memory. Dropping them costs one disk read when the window comes back and
 * can free tens of megabytes after browsing large files.
 *
 * The same moment is the right one to stop the terminals: a build that keeps
 * logging in the background must not keep filling scrollback nobody is looking
 * at. Rust then keeps only the tail of the stream (see `terminal.rs`), so the
 * shell never blocks and memory stops growing.
 *
 * Coming back is the mirror image: git may have moved while another window was
 * in front (a commit in the terminal, a checkout in Finder), so the lists are
 * re-read once — silently, and without touching the open commit / diff.
 */
export function useMemoryHygiene() {
  useEffect(() => {
    const onVisibilityChange = () => {
      const hidden = document.visibilityState === "hidden";
      if (hidden) releaseTransientCaches();
      setTerminalsWindowHidden(hidden);
      if (!hidden) syncGit();
    };

    const syncGit = () => {
      // A dialog owns the window: refreshing under it would fight the user's
      // pending input (identity form, commit message).
      if (document.visibilityState === "hidden") return;
      if (document.querySelector('[data-modal="true"]')) return;
      const store = useAppStore.getState();
      if (!store.booted) return;
      // A native folder sheet is mid-flow: the project is about to be reloaded.
      if (store.addingProject || store.relinkingId) return;
      void store.syncOnFocus();
    };

    // `focus` fires for the native window, `visibilitychange` for tab/page level
    // hiding; both can happen for one switch, and `syncOnFocus` de-duplicates.
    window.addEventListener("focus", syncGit);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", syncGit);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
