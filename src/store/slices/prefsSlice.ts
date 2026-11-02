import type { StateCreator } from "zustand";

import { applyTheme, readTheme, setStoredTheme } from "../../lib/theme";
import type { Theme } from "../../lib/theme";
import type { AppState } from "../appStore";

export type { Theme };

export interface PrefsSlice {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/**
 * App-wide appearance. Kept out of `settingsSlice` because that one is
 * repository-scoped (identity, remotes) while these apply to the whole window
 * and must be usable before any project is opened.
 */
export const createPrefsSlice: StateCreator<AppState, [], [], PrefsSlice> = (set) => ({
  theme: readTheme(),

  setTheme(theme) {
    setStoredTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
});