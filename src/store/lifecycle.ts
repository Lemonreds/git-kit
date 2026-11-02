import { useEffect } from "react";

import { setTerminalsWindowHidden } from "../lib/terminal";
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
 */
export function useMemoryHygiene() {
  useEffect(() => {
    const onVisibilityChange = () => {
      const hidden = document.visibilityState === "hidden";
      if (hidden) releaseTransientCaches();
      setTerminalsWindowHidden(hidden);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
}