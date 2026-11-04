import type { StateCreator } from "zustand";

import { COMMAND_BY_ID, defaultKeymap, resolveKeymap } from "../../lib/commands";
import type { Binding, CommandId, Keymap } from "../../lib/keymap";
import { readKeymap, saveKeymap } from "../../lib/keymap";
import { applyTheme, readTheme, setStoredTheme } from "../../lib/theme";
import type { Theme } from "../../lib/theme";
import type { AppState } from "../appStore";

export type { Theme };

export interface PrefsSlice {
  theme: Theme;
  /** Effective bindings: stored overrides already merged over the defaults. */
  keymap: Keymap;

  setTheme: (theme: Theme) => void;
  setBinding: (id: CommandId, binding: Binding | null) => void;
  resetBinding: (id: CommandId) => void;
  resetKeymap: () => void;
}

/**
 * App-wide appearance and keybindings. Kept out of `settingsSlice` because that
 * one is repository-scoped (identity, remotes) while these apply to the whole
 * window and must be usable before any project is opened.
 */
export const createPrefsSlice: StateCreator<AppState, [], [], PrefsSlice> = (set, get) => {
  // Listen for system theme changes when theme is set to "system"
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemThemeChange = () => {
    const { theme } = get();
    if (theme === "system") {
      applyTheme("system");
    }
  };

  mediaQuery.addEventListener("change", handleSystemThemeChange);

  const commit = (keymap: Keymap) => {
    set({ keymap });
    saveKeymap(keymap);
  };

  return {
    theme: readTheme(),
    keymap: resolveKeymap(readKeymap()),

    setTheme(theme) {
      setStoredTheme(theme);
      applyTheme(theme);
      set({ theme });
    },

    setBinding(id, binding) {
      commit({ ...get().keymap, [id]: binding });
    },

    resetBinding(id) {
      const fallback = COMMAND_BY_ID.get(id)?.defaultBinding ?? null;
      commit({ ...get().keymap, [id]: fallback });
    },

    resetKeymap() {
      commit(defaultKeymap());
    },
  };
};