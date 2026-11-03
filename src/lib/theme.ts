export type Theme = "light" | "dark";

const STORAGE_KEY = "gk.theme";

/**
 * Light is the default on purpose: the app used to follow the system and that
 * meant a dark window nobody asked for. Following the OS is available implicitly
 * by picking a theme once — the choice is explicit and survives restarts.
 */
export function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Apply the theme to the app's own surface: CSS tokens only.
 *
 * Deliberately scoped: the native window chrome and the terminal keep their own
 * (light) look, so switching the theme here never leaks into them. Called at boot
 * before the first paint and on every change, which is what makes the switch in
 * Settings take effect immediately.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Keeps native scrollbars, form controls and text selection in the same mode.
  root.style.colorScheme = theme;
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / quota: the choice just will not survive a restart.
  }
}