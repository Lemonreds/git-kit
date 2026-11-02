import { api } from "./ipc";

type Xterm = import("@xterm/xterm").Terminal;
type FitAddonLike = import("@xterm/addon-fit").FitAddon;
type XtermTheme = import("@xterm/xterm").ITheme;

/**
 * The xterm instances live outside React, in a plain module-level map.
 *
 * Why not a store/state: an xterm `Terminal` owns a scroll buffer, a renderer and
 * a DOM subtree. Putting it behind zustand would re-render the tree on every
 * keystroke echo, and React would happily unmount it (losing the buffer) on any
 * key change. Here the React components stay thin: they hand over one stable
 * `<div>` per session and never touch the object again.
 *
 * Memory budget per session ≈ scrollback (1000 lines ≈ 0.5–1 MB) + the shell
 * process on the Rust side. Three sessions max, enforced by the store, with a
 * matching backstop in `terminal.rs`.
 */

const MONO_FONT = '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace';

/** Scrollback is a settings knob: it is the single biggest per-session allocation. */
const SCROLLBACK_KEY = "gk.termScrollback";
const DEFAULT_SCROLLBACK = 1000;

/**
 * Write-queue hysteresis. `queued` counts bytes handed to `term.write()` that
 * xterm has not parsed yet; when it grows past the high-water mark Rust stops
 * pushing (and keeps only its tail) until we drain.
 */
const HIGH_WATER = 128 * 1024;
const LOW_WATER = 24 * 1024;

/** ANSI palettes. Chrome colours come from the CSS variables; only the 16 ANSI
 *  slots are literal here, because xterm parses them as concrete colours. */
const ANSI_LIGHT = {
  black: "#2f2f34",
  red: "#c72e26",
  green: "#1f9d55",
  yellow: "#946200",
  blue: "#2f6feb",
  magenta: "#9b3fbf",
  cyan: "#0d8b98",
  white: "#c8c9cf",
  brightBlack: "#6b6d75",
  brightRed: "#d93a32",
  brightGreen: "#278d4f",
  brightYellow: "#ac6a00",
  brightBlue: "#4a86f7",
  brightMagenta: "#b356d4",
  brightCyan: "#19a6b4",
  brightWhite: "#ffffff",
};

const ANSI_DARK = {
  black: "#2f2f34",
  red: "#ff6f66",
  green: "#45c96b",
  yellow: "#e0a75a",
  blue: "#5a94ff",
  magenta: "#c77dff",
  cyan: "#4ec9d4",
  white: "#d8d8dd",
  brightBlack: "#6b6b73",
  brightRed: "#ff918a",
  brightGreen: "#6fdc8c",
  brightYellow: "#f0c07a",
  brightBlue: "#8ab4ff",
  brightMagenta: "#dda6ff",
  brightCyan: "#7fe0e8",
  brightWhite: "#f2f2f4",
};

export interface TerminalMountOptions {
  path: string;
  shell?: string | null;
  onExit?: (code: number | null) => void;
}

interface Attachment {
  key: string;
  rustId: string | null;
  term: Xterm | null;
  fit: FitAddonLike | null;
  host: HTMLElement | null;
  observer: ResizeObserver | null;
  /** Keystrokes typed before the pty finished opening. */
  pendingInput: string[];
  queued: number;
  /** Rust asked to stop pushing because the write queue is deep. */
  throttled: boolean;
  /** The tab is the active one and the panel is expanded. */
  visible: boolean;
  /** The whole window is hidden (⌘H, another app in front, screen locked). */
  windowHidden: boolean;
  /** Last value pushed to Rust, so the flag is only flipped on a real change. */
  pausedInRust: boolean;
  disposed: boolean;
  fitFrame: number;
  onExit?: (code: number | null) => void;
}

const attachments = new Map<string, Attachment>();

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function prefersDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

function terminalTheme(): XtermTheme {
  const dark = prefersDark();
  return {
    background: cssVar("--gk-panel", dark ? "#1c1c1f" : "#ffffff"),
    foreground: cssVar("--gk-ink", dark ? "#f2f2f4" : "#1c1c1e"),
    cursor: cssVar("--gk-accent", dark ? "#5a94ff" : "#2f6feb"),
    cursorAccent: cssVar("--gk-panel", dark ? "#1c1c1f" : "#ffffff"),
    selectionBackground: dark ? "rgba(90,148,255,0.30)" : "rgba(47,111,235,0.22)",
    ...(dark ? ANSI_DARK : ANSI_LIGHT),
  };
}

export function scrollbackSetting(): number {
  const raw = Number(localStorage.getItem(SCROLLBACK_KEY));
  return Number.isFinite(raw) && raw >= 200 ? Math.round(raw) : DEFAULT_SCROLLBACK;
}

/** Recolouring on a light/dark switch: a theme write, not a rebuild. */
export function applyTerminalTheme(): void {
  for (const attachment of attachments.values()) {
    if (attachment.term && !attachment.disposed) {
      attachment.term.options.theme = terminalTheme();
    }
  }
}

/** Whether a live xterm exists for this session (the panel uses it for the badge). */
export function isAttached(key: string): boolean {
  return attachments.has(key);
}

/**
 * Create the xterm for a session and open the pty behind it.
 *
 * Idempotent: React StrictMode runs mount effects twice in development, and
 * re-running `Terminal.open()` on the same node would duplicate the renderer.
 */
export async function attachTerminal(
  key: string,
  host: HTMLElement,
  options: TerminalMountOptions,
): Promise<void> {
  const existing = attachments.get(key);
  if (existing) {
    existing.onExit = options.onExit;
    // A re-mounted host (panel closed and reopened) gets the live element moved
    // into it instead of a second renderer.
    if (existing.host !== host) {
      existing.observer?.disconnect();
      existing.observer = null;
      existing.host = host;
      const element = existing.term?.element;
      if (element) host.replaceChildren(element);
      if (existing.term) {
        existing.observer = new ResizeObserver(() => fitTerminal(key));
        existing.observer.observe(host);
      }
      fitTerminal(key);
    }
    return;
  }

  const attachment: Attachment = {
    key,
    rustId: null,
    term: null,
    fit: null,
    host,
    observer: null,
    pendingInput: [],
    queued: 0,
    throttled: false,
    visible: true,
    windowHidden: document.visibilityState === "hidden",
    pausedInRust: false,
    disposed: false,
    fitFrame: 0,
    onExit: options.onExit,
  };
  attachments.set(key, attachment);

  // Loaded on demand: a user who never opens a terminal never pays the ~300 KB.
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
    import("@xterm/xterm/css/xterm.css"),
  ]);
  if (attachment.disposed) return;

  const term = new Terminal({
    allowProposedApi: false,
    cursorBlink: true,
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 1.25,
    scrollback: scrollbackSetting(),
    theme: terminalTheme(),
    // The panel has its own scrolling; letting the wheel escape would jump the
    // whole layout instead of scrolling the buffer.
    scrollOnUserInput: true,
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(host);

  attachment.term = term;
  attachment.fit = fitAddon;

  term.onData((data) => {
    if (attachment.rustId) {
      void api.terminalWrite(attachment.rustId, data).catch(() => undefined);
      return;
    }
    // Typed faster than the pty opened: keep the keystrokes, not the order of
    // arrival, which is what the user sees anyway.
    if (attachment.pendingInput.length < 64) attachment.pendingInput.push(data);
  });

  try {
    fitAddon.fit();
  } catch {
    // Mounted while the panel was still 0×0; the observer fixes it next frame.
  }

  const observer = new ResizeObserver(() => fitTerminal(key));
  observer.observe(host);
  attachment.observer = observer;

  let info;
  try {
    info = await api.terminalOpen(options.path, term.cols, term.rows, {
      onData: (bytes) => receive(attachment, bytes),
      onExit: (code) => {
        attachment.rustId = null;
        attachment.onExit?.(code);
      },
    }, options.shell);
  } catch (error) {
    attachments.delete(key);
    attachment.disposed = true;
    observer.disconnect();
    try {
      term.dispose();
    } catch {
      // already torn down
    }
    throw error;
  }

  if (attachment.disposed) {
    void api.terminalClose(info.id).catch(() => undefined);
    return;
  }

  attachment.rustId = info.id;
  const typed = attachment.pendingInput.join("");
  attachment.pendingInput = [];
  if (typed) {
    void api.terminalWrite(info.id, typed).catch(() => undefined);
  }
  syncPause(attachment);
  // The pty was opened with whatever `term.cols/rows` said at that moment; the
  // first `fit()` usually lands on the frame *after* `open()`, so the grid is
  // still 80×24 and the shell would render a narrow screen. Re-fit now that
  // there is a session to tell about it.
  fitTerminal(key);
  if (attachment.visible && !attachment.windowHidden) term.focus();
}

function receive(attachment: Attachment, bytes: Uint8Array): void {
  const term = attachment.term;
  if (!term || attachment.disposed) return;

  attachment.queued += bytes.length;
  term.write(bytes, () => {
    attachment.queued = Math.max(0, attachment.queued - bytes.length);
    if (attachment.throttled && attachment.queued <= LOW_WATER) {
      attachment.throttled = false;
      syncPause(attachment);
    }
  });

  if (!attachment.throttled && attachment.queued >= HIGH_WATER) {
    attachment.throttled = true;
    syncPause(attachment);
  }
}

/**
 * Collapse both pause reasons (tab hidden, window hidden, write queue deep) into
 * the single boolean the Rust side understands, and only cross the IPC boundary
 * when it actually changes.
 */
function syncPause(attachment: Attachment): void {
  const wanted = attachment.throttled || !attachment.visible || attachment.windowHidden;
  const id = attachment.rustId;
  // Before the pty exists there is nothing to tell: `attachTerminal` re-runs this
  // right after it stores the id.
  if (!id) return;
  if (wanted === attachment.pausedInRust) return;
  attachment.pausedInRust = wanted;
  const call = wanted ? api.terminalPause(id) : api.terminalResume(id);
  void call.catch(() => undefined);
}

/** Debounced to one resize per frame: dragging the splitter must not spam the pty. */
export function fitTerminal(key: string): void {
  const attachment = attachments.get(key);
  if (!attachment?.term || !attachment.fit) return;
  if (attachment.fitFrame) cancelAnimationFrame(attachment.fitFrame);
  attachment.fitFrame = requestAnimationFrame(() => {
    attachment.fitFrame = 0;
    if (attachment.disposed || !attachment.term || !attachment.fit) return;
    // `display: none` reports no offsetParent and would compute a 0×0 grid.
    if (!attachment.host?.offsetParent) return;
    try {
      attachment.fit.fit();
    } catch {
      return;
    }
    if (attachment.rustId) {
      const { cols, rows } = attachment.term;
      void api.terminalResize(attachment.rustId, cols, rows).catch(() => undefined);
    }
  });
}

export function setTerminalVisible(key: string, visible: boolean): void {
  const attachment = attachments.get(key);
  if (!attachment) return;
  attachment.visible = visible;
  syncPause(attachment);
  if (visible) fitTerminal(key);
}

/** Window-level pause, shared by every session (see store/lifecycle.ts). */
export function setTerminalsWindowHidden(hidden: boolean): void {
  for (const attachment of attachments.values()) {
    attachment.windowHidden = hidden;
    syncPause(attachment);
  }
}

export function focusTerminal(key: string): void {
  attachments.get(key)?.term?.focus();
}

export function clearTerminal(key: string): void {
  const attachment = attachments.get(key);
  if (!attachment?.term) return;
  attachment.term.clear();
  // Ctrl+L: ask the shell to repaint its own prompt on a clean screen.
  if (attachment.rustId) {
    void api.terminalWrite(attachment.rustId, "\u000c").catch(() => undefined);
  }
}

export function writeTerminal(key: string, data: string): void {
  const attachment = attachments.get(key);
  if (!attachment?.rustId) return;
  void api.terminalWrite(attachment.rustId, data).catch(() => undefined);
}

/**
 * Tear the session down for good. Called from the store (tab close, LRU eviction,
 * project removed) and *not* from a React effect cleanup — StrictMode's fake
 * unmount would otherwise kill a perfectly healthy shell.
 */
export function disposeTerminal(key: string): void {
  const attachment = attachments.get(key);
  if (!attachment) return;
  attachments.delete(key);
  attachment.disposed = true;
  if (attachment.fitFrame) cancelAnimationFrame(attachment.fitFrame);
  attachment.observer?.disconnect();
  attachment.observer = null;
  const rustId = attachment.rustId;
  attachment.rustId = null;
  if (rustId) void api.terminalClose(rustId).catch(() => undefined);
  try {
    attachment.term?.dispose();
  } catch {
    // already torn down
  }
  attachment.term = null;
  attachment.fit = null;
  attachment.host = null;
}

export function disposeAllTerminals(): void {
  for (const key of [...attachments.keys()]) disposeTerminal(key);
}