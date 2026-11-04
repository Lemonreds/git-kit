export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "gk.theme";

/**
 * Get the system's current color scheme preference.
 */
export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Resolve the actual theme to apply based on user preference.
 * If theme is "system", returns the current system preference.
 */
export function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

/**
 * Light is the default on purpose: the app used to follow the OS silently, which
 * meant a dark window nobody asked for. Following the system is still available,
 * but only as an explicit `system` choice that survives restarts.
 */
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark") return "dark";
    if (stored === "system") return "system";
    return "light";
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
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  // Keeps native scrollbars, form controls and text selection in the same mode.
  root.style.colorScheme = resolved;
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / quota: the choice just will not survive a restart.
  }
}