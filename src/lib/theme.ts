import { getCurrentWindow } from "@tauri-apps/api/window";

import { applyTerminalTheme } from "./terminal";

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
 * Push the theme everywhere it is visible: CSS tokens, native window chrome and
 * the xterm palettes. Called at boot (before the first paint) and on every change.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Keeps native scrollbars, form controls and text selection in the same mode.
  root.style.colorScheme = theme;

  // The macOS title bar is native: without this the traffic lights and the
  // overlay stay light above a dark window.
  void getCurrentWindow()
    .setTheme(theme)
    .catch(() => undefined);

  // xterm reads the `--gk-*` tokens when its theme is built.
  applyTerminalTheme();
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / quota: the choice just will not survive a restart.
  }
}