import { useShallow } from "zustand/react/shallow";

import { useAppStore, type AppState } from "./appStore";

/**
 * Subscribe to a group of fields with ONE subscription.
 *
 * The selector still runs on every store update (zustand has no per-key
 * subscriptions), but `useShallow` re-renders only when one of the selected
 * fields actually changed. Behaviour matches N separate `useAppStore` calls with
 * a single subscription instead of N.
 */
export function useSlice<T>(selector: (state: AppState) => T): T {
  return useAppStore(useShallow(selector));
}