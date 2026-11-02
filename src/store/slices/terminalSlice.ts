import type { StateCreator } from "zustand";

import { t } from "../../i18n";
import { disposeTerminal } from "../../lib/terminal";
import type { AppState } from "../appStore";
import { feedback } from "../shared";

/** Live shells are the expensive part (one process each), so the cap is low. */
export const MAX_TERMINALS = 3;

const HEIGHT_KEY = "gk.terminalHeight";
export const TERMINAL_HEIGHT = { min: 140, max: 620, initial: 260 };

export interface TerminalTab {
  /** Local key. It is *not* the pty id: the tab exists before the shell does. */
  id: string;
  projectId: string;
  projectName: string;
  cwd: string;
  status: "live" | "exited";
  exitCode: number | null;
  lastUsedAt: number;
}

export interface TerminalSlice {
  terminals: TerminalTab[];
  activeTerminalId: string | null;
  terminalOpen: boolean;
  terminalHeight: number;

  openTerminal: (projectId: string) => void;
  closeTerminal: (id: string) => void;
  activateTerminal: (id: string) => void;
  toggleTerminalPanel: () => void;
  setTerminalOpen: (open: boolean) => void;
  setTerminalHeight: (height: number) => void;
  markTerminalExit: (id: string, code: number | null) => void;
  closeProjectTerminals: (projectId: string) => void;
}

function readHeight(): number {
  const raw = Number(localStorage.getItem(HEIGHT_KEY));
  return Number.isFinite(raw) && raw >= TERMINAL_HEIGHT.min ? raw : TERMINAL_HEIGHT.initial;
}

/** Newest `keep` entries by last use; the rest is handed back for disposal. */
function splitByAge(tabs: TerminalTab[], keep: number) {
  if (tabs.length <= keep) return { kept: tabs, evicted: [] as TerminalTab[] };
  const ranked = [...tabs].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  const survivors = new Set(ranked.slice(0, keep).map((tab) => tab.id));
  return {
    kept: tabs.filter((tab) => survivors.has(tab.id)),
    evicted: tabs.filter((tab) => !survivors.has(tab.id)),
  };
}

/**
 * Terminals are keyed by project, not by "the current pane": switching projects
 * keeps the shell alive (that is the whole point of a per-repo terminal), and the
 * LRU ceiling is what actually bounds the memory.
 */
export const createTerminalSlice: StateCreator<AppState, [], [], TerminalSlice> = (set, get) => {
  const { notify } = feedback(get);

  const disposeMany = (tabs: TerminalTab[]) => {
    for (const tab of tabs) disposeTerminal(tab.id);
  };

  const activate = (id: string) => {
    set((state) => ({
      activeTerminalId: id,
      terminalOpen: true,
      terminals: state.terminals.map((tab) =>
        tab.id === id ? { ...tab, lastUsedAt: Date.now() } : tab,
      ),
    }));
  };

  return {
    terminals: [],
    activeTerminalId: null,
    terminalOpen: false,
    terminalHeight: readHeight(),

    openTerminal(projectId) {
      const project = get().projects.find((item) => item.id === projectId);
      if (!project) return;
      if (project.status !== "ok") {
        notify("error", t("store.projectUnavailable"));
        return;
      }

      const live = get().terminals.find(
        (tab) => tab.projectId === projectId && tab.status === "live",
      );
      if (live) {
        activate(live.id);
        return;
      }

      // A shell that already exited leaves a dead tab behind; replace it.
      const stale = get().terminals.filter(
        (tab) => tab.projectId === projectId && tab.status === "exited",
      );
      const base = get().terminals.filter((tab) => !stale.some((item) => item.id === tab.id));
      const { kept, evicted } = splitByAge(base, MAX_TERMINALS - 1);
      disposeMany([...stale, ...evicted]);

      const tab: TerminalTab = {
        id: crypto.randomUUID(),
        projectId,
        projectName: project.name,
        cwd: project.path,
        status: "live",
        exitCode: null,
        lastUsedAt: Date.now(),
      };

      set({
        terminals: [...kept, tab],
        activeTerminalId: tab.id,
        terminalOpen: true,
      });
    },

    closeTerminal(id) {
      disposeTerminal(id);
      set((state) => {
        const terminals = state.terminals.filter((tab) => tab.id !== id);
        const activeTerminalId =
          state.activeTerminalId === id
            ? (terminals[terminals.length - 1]?.id ?? null)
            : state.activeTerminalId;
        return {
          terminals,
          activeTerminalId,
          // Nothing left to show: the panel collapses with its last tab.
          terminalOpen: terminals.length > 0 && state.terminalOpen,
        };
      });
    },

    activateTerminal(id) {
      if (!get().terminals.some((tab) => tab.id === id)) return;
      activate(id);
    },

    toggleTerminalPanel() {
      if (get().terminalOpen) {
        set({ terminalOpen: false });
        return;
      }
      const active = get().activeTerminalId;
      if (active && get().terminals.some((tab) => tab.id === active && tab.status === "live")) {
        set({ terminalOpen: true });
        return;
      }
      const project = get().activeProject;
      if (!project) {
        notify("error", t("store.selectProjectFirst"));
        return;
      }
      get().openTerminal(project.id);
    },

    setTerminalOpen(open) {
      if (open) {
        get().toggleTerminalPanel();
        return;
      }
      set({ terminalOpen: false });
    },

    setTerminalHeight(height) {
      localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
      set({ terminalHeight: Math.round(height) });
    },

    markTerminalExit(id, code) {
      set((state) => ({
        terminals: state.terminals.map((tab) =>
          tab.id === id ? { ...tab, status: "exited" as const, exitCode: code } : tab,
        ),
      }));
    },

    closeProjectTerminals(projectId) {
      const doomed = get().terminals.filter((tab) => tab.projectId === projectId);
      if (doomed.length === 0) return;
      disposeMany(doomed);
      set((state) => {
        const terminals = state.terminals.filter((tab) => tab.projectId !== projectId);
        return {
          terminals,
          activeTerminalId: terminals.some((tab) => tab.id === state.activeTerminalId)
            ? state.activeTerminalId
            : (terminals[terminals.length - 1]?.id ?? null),
          terminalOpen: terminals.length > 0 && state.terminalOpen,
        };
      });
    },
  };
};