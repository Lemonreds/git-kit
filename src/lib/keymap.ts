/**
 * Keybindings: one registry of commands, one persisted map of overrides.
 *
 * The map stores a full binding per command (`null` = deliberately unbound), so
 * a user can unbind a default without us having to remember "was it a default?".
 * Everything is matched against `KeyboardEvent.key` with explicit modifier
 * comparison: `mod` means ⌘ on macOS and Ctrl elsewhere, and either one is
 * accepted on macOS because the rest of the app already treats them alike.
 */

export type CommandId =
  | "palette"
  | "refresh"
  | "addProject"
  | "terminal"
  | "paneBranches"
  | "paneChanges"
  | "paneStash"
  | "paneTags"
  | "paneWorkflows"
  | "commitSearch"
  | "fetch"
  | "settings"
  | "fileHistory"
  | "blame"
  | "findInDiff"
  | "saveConflict";

export interface Binding {
  /** Lower-cased `KeyboardEvent.key`. */
  key: string;
  /** ⌘ / Ctrl. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export type Keymap = Record<CommandId, Binding | null>;

export const IS_MAC =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

const STORAGE_KEY = "gk.keymap";

/** Modifier-only keydowns never become a binding. */
const MODIFIER_KEYS = new Set(["meta", "control", "alt", "shift", "capslock", "dead"]);

export function bindingFromEvent(event: KeyboardEvent): Binding | null {
  const key = event.key.toLowerCase();
  if (!key || MODIFIER_KEYS.has(key)) return null;
  return {
    key,
    mod: event.metaKey || event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

export function matchesBinding(event: KeyboardEvent, binding: Binding | null): boolean {
  if (!binding) return false;
  if (event.key.toLowerCase() !== binding.key) return false;
  const mod = event.metaKey || event.ctrlKey;
  if (mod !== binding.mod) return false;
  if (event.shiftKey !== binding.shift) return false;
  if (event.altKey !== binding.alt) return false;
  return true;
}

/** `⌘⇧K` on macOS, `Ctrl+Shift+K` elsewhere. */
export function formatBinding(binding: Binding | null): string {
  if (!binding) return "";
  const parts: string[] = [];
  if (IS_MAC) {
    if (binding.mod) parts.push("⌘");
    if (binding.alt) parts.push("⌥");
    if (binding.shift) parts.push("⇧");
    parts.push(keyLabel(binding.key));
    return parts.join("");
  }
  if (binding.mod) parts.push("Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");
  parts.push(keyLabel(binding.key));
  return parts.join("+");
}

/**
 * One label per key, for rendering a separate cap for each part of a binding.
 * Modifiers stay in the platform's order, so `⌘ ⇧ K` reads the way it is typed.
 */
export function bindingKeyLabels(binding: Binding | null): string[] {
  if (!binding) return [];
  const parts: string[] = [];
  if (IS_MAC) {
    if (binding.mod) parts.push("⌘");
    if (binding.alt) parts.push("⌥");
    if (binding.shift) parts.push("⇧");
  } else {
    if (binding.mod) parts.push("Ctrl");
    if (binding.alt) parts.push("Alt");
    if (binding.shift) parts.push("Shift");
  }
  parts.push(keyLabel(binding.key));
  return parts;
}

/**
 * Split a `formatBinding()` string back into per-key labels, for call sites that
 * only kept the display text.
 */
export function splitShortcutLabel(label: string): string[] {
  if (!label) return [];
  // macOS prints the glyphs glued together (⌘⇧K); everywhere else uses `+`.
  return IS_MAC ? Array.from(label) : label.split("+").filter(Boolean);
}

function keyLabel(key: string): string {
  switch (key) {
    case " ":
      return "Space";
    case "arrowup":
      return "↑";
    case "arrowdown":
      return "↓";
    case "arrowleft":
      return "←";
    case "arrowright":
      return "→";
    case "escape":
      return "Esc";
    case "enter":
      return "Enter";
    case "backspace":
      return "⌫";
    case "delete":
      return "Del";
    case "tab":
      return "Tab";
    default:
      return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  }
}

export function sameBinding(a: Binding | null, b: Binding | null): boolean {
  if (!a || !b) return a === b;
  return a.key === b.key && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;
}

export function readKeymap(): Partial<Keymap> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const result: Partial<Keymap> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null) {
        result[id as CommandId] = null;
        continue;
      }
      if (!value || typeof value !== "object") continue;
      const binding = value as Record<string, unknown>;
      if (typeof binding.key !== "string") continue;
      result[id as CommandId] = {
        key: binding.key.toLowerCase(),
        mod: binding.mod === true,
        shift: binding.shift === true,
        alt: binding.alt === true,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export function saveKeymap(keymap: Keymap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keymap));
  } catch {
    // Private mode / quota: the overrides just will not survive a restart.
  }
}