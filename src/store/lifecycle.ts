import { useEffect } from "react";

import { releaseTransientCaches } from "./shared";

/**
 * Memory hygiene for a long-running desktop window.
 *
 * When the window is hidden (⌘H, another app in front, screen locked) the user
 * cannot see any rendered diff, so the cached file lists and patches are just
 * held memory. Dropping them costs one disk read when the window comes back and
 * can free tens of megabytes after browsing large files.
 */
export function useMemoryHygiene() {
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") releaseTransientCaches();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
}