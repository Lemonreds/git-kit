import type { StateCreator } from "zustand";

import { t } from "../../i18n";
import { api, IpcError } from "../../lib/ipc";
import type { BlameHunk, FileDiff, FileHistoryEntry } from "../../lib/types";
import type { AppState } from "../appStore";
import { blameCache, cacheKey, errorMessage, feedback, historyCache, token } from "../shared";

export type FileHistoryTab = "history" | "blame";

/** Lines per blame request; the backend caps a window at 2000. */
const BLAME_WINDOW = 1200;
/**
 * Files up to this size are blamed completely on open (at most three windows).
 * Beyond it, windows load as the user scrolls: every `git blame` call has to walk
 * the file anyway, so neither more memory nor more scroll stalls are gained by
 * fetching the rest up front.
 */
const BLAME_EAGER_LINES = 3600;

const HISTORY_PAGE = 100;
const HISTORY_MAX = 500;

export interface FileViewState {
  path: string;
  /** `null` = working tree (uncommitted lines show as "not committed yet"). */
  rev: string | null;
  tab: FileHistoryTab;
  entries: FileHistoryEntry[];
  historyLoading: boolean;
  /** More commits exist beyond the fetched cap. */
  historyTruncated: boolean;
  selectedSha: string | null;
  diff: FileDiff | null;
  diffLoading: boolean;
  /** The selected commit did not touch this path (renamed / untouched). */
  diffMissing: boolean;
  blameHunks: BlameHunk[];
  /** File content of the loaded blame lines, aligned with line 1. */
  blameLines: string[];
  /** Contiguous lines loaded so far; 0 = nothing yet. */
  blameLoadedTo: number;
  blameTotalLines: number;
  blameLoading: boolean;
  blameError: string | null;
}

export interface FileHistorySlice {
  fileView: FileViewState | null;

  /**
   * Open the history + blame view for `path`. `rev = null` means the working
   * tree (history from HEAD), a sha blames and lists that revision.
   */
  openFileHistory: (path: string, rev?: string | null) => Promise<void>;
  setFileHistoryTab: (tab: FileHistoryTab) => void;
  selectHistoryCommit: (sha: string) => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  /** Load the window starting at `startLine` (no-op when already loaded). */
  requestBlame: (startLine: number) => Promise<void>;
  refreshFileView: () => Promise<void>;
  closeFileView: () => void;
}

function cacheKeyFor(projectId: string, rev: string | null, path: string): string {
  // `worktree` cannot collide with a rev: revisions are shas / ref names.
  return cacheKey(projectId, rev ?? "worktree", path);
}

/** Append a window and coalesce the run that straddles the window boundary. */
function mergeHunks(current: BlameHunk[], next: BlameHunk[]): BlameHunk[] {
  if (current.length === 0) return next;
  const merged = current.slice();
  for (const hunk of next) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.commitSha === hunk.commitSha &&
      last.startLine + last.lines === hunk.startLine
    ) {
      merged[merged.length - 1] = { ...last, lines: last.lines + hunk.lines };
      continue;
    }
    merged.push(hunk);
  }
  return merged;
}

/** Append a window's content, skipping lines that are already loaded. */
function mergeLines(current: string[], startLine: number, next: string[]): string[] {
  if (next.length === 0) return current;
  const from = Math.max(0, current.length + 1 - startLine);
  if (from >= next.length) return current;
  return [...current, ...next.slice(from)];
}

/**
 * File history and blame for one path, shown in the diff column.
 *
 * Kept in its own slice: the diff column already subscribes to the commit /
 * worktree diff state, and a blame window changing must not re-render those.
 */
export const createFileHistorySlice: StateCreator<AppState, [], [], FileHistorySlice> = (set, get) => {
  const { fail } = feedback(get);

  const currentKey = (): string | null => {
    const project = get().activeProject;
    const view = get().fileView;
    if (!project || !view) return null;
    return cacheKeyFor(project.id, view.rev, view.path);
  };

  const loadHistory = async (epoch: number) => {
    const project = get().activeProject;
    const view = get().fileView;
    if (!project || !view) return;
    const key = cacheKeyFor(project.id, view.rev, view.path);
    const cached = historyCache.get(key);
    if (cached) {
      set((state) =>
        state.fileView && state.fileView.path === view.path && state.fileView.rev === view.rev
          ? {
              fileView: {
                ...state.fileView,
                entries: cached.entries,
                historyTruncated: cached.truncated,
                historyLoading: false,
              },
            }
          : state,
      );
      const first = cached.entries[0];
      if (first) void get().selectHistoryCommit(first.sha);
      return;
    }

    try {
      const page = await api.fileHistory(project.path, view.path, view.rev, HISTORY_PAGE);
      if (epoch !== token.detail) return;
      historyCache.set(key, page);
      const current = get().fileView;
      // The user may have closed or switched the view while this was loading.
      if (!current || current.path !== view.path || current.rev !== view.rev) return;
      set({ fileView: { ...current, entries: page.entries, historyTruncated: page.truncated, historyLoading: false } });
      const first = page.entries[0];
      if (first) await get().selectHistoryCommit(first.sha);
    } catch (error) {
      if (epoch !== token.detail) return;
      const current = get().fileView;
      if (!current) return;
      set({ fileView: { ...current, historyLoading: false } });
      fail(t("store.loadFileHistoryFailed"), error);
    }
  };

  return {
    fileView: null,

    async openFileHistory(path, rev = null) {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      // Switching files invalidates in-flight history / diff / blame loads.
      const epoch = ++token.detail;

      set({
        fileView: {
          path,
          rev,
          tab: "history",
          entries: [],
          historyLoading: true,
          historyTruncated: false,
          selectedSha: null,
          diff: null,
          diffLoading: false,
          diffMissing: false,
          blameHunks: [],
          blameLines: [],
          blameLoadedTo: 0,
          blameTotalLines: 0,
          blameLoading: false,
          blameError: null,
        },
      });

      await loadHistory(epoch);
    },

    setFileHistoryTab(tab) {
      const view = get().fileView;
      if (!view || view.tab === tab) return;
      set({ fileView: { ...view, tab } });
      if (tab === "blame" && view.blameLoadedTo === 0 && !view.blameLoading) {
        void get().requestBlame(1);
      }
    },

    async selectHistoryCommit(sha) {
      const project = get().activeProject;
      const view = get().fileView;
      if (!project || !view || !sha) return;
      if (view.selectedSha === sha && view.diff) return;

      const epoch = token.detail;
      set({ fileView: { ...view, selectedSha: sha, diff: null, diffLoading: true, diffMissing: false } });
      try {
        const diff = await api.getFileDiff(project.path, sha, view.path);
        if (epoch !== token.detail) return;
        const current = get().fileView;
        if (!current || current.selectedSha !== sha) return;
        set({ fileView: { ...current, diff, diffLoading: false } });
      } catch (error) {
        if (epoch !== token.detail) return;
        const current = get().fileView;
        if (!current || current.selectedSha !== sha) return;
        // `file_not_changed` is expected: the commit may only have renamed the
        // file, so its content diff lives under another path.
        const stale = error instanceof IpcError && error.code === "file_not_changed";
        set({
          fileView: { ...current, diff: null, diffLoading: false, diffMissing: true },
        });
        if (!stale) fail(t("store.loadFileDiffFailed"), error);
      }
    },

    async loadMoreHistory() {
      const project = get().activeProject;
      const view = get().fileView;
      if (!project || !view || view.historyLoading || !view.historyTruncated) return;
      const key = cacheKeyFor(project.id, view.rev, view.path);
      const limit = Math.min(view.entries.length + HISTORY_PAGE, HISTORY_MAX);
      set({ fileView: { ...view, historyLoading: true } });
      try {
        const page = await api.fileHistory(project.path, view.path, view.rev, limit);
        historyCache.set(key, page);
        const current = get().fileView;
        if (!current || current.path !== view.path) return;
        set({
          fileView: {
            ...current,
            entries: page.entries,
            historyTruncated: page.truncated,
            historyLoading: false,
          },
        });
      } catch (error) {
        const current = get().fileView;
        if (!current) return;
        set({ fileView: { ...current, historyLoading: false } });
        fail(t("store.loadFileHistoryFailed"), error);
      }
    },

    async requestBlame(startLine) {
      const project = get().activeProject;
      const view = get().fileView;
      if (!project || !view) return;
      if (view.blameLoading) return;
      const start = Math.max(1, startLine);
      if (view.blameLoadedTo > 0 && start <= view.blameLoadedTo) return;
      if (view.blameTotalLines > 0 && start > view.blameTotalLines) return;

      const end = start + BLAME_WINDOW - 1;
      const key = `${cacheKeyFor(project.id, view.rev, view.path)}::${start}`;
      const cached = blameCache.get(key);
      if (cached) {
        const current = get().fileView;
        if (!current || current.path !== view.path) return;
        set({
          fileView: {
            ...current,
            blameHunks: mergeHunks(current.blameHunks, cached.hunks),
            blameLines: mergeLines(current.blameLines, cached.startLine, cached.lines),
            blameLoadedTo: Math.max(current.blameLoadedTo, cached.endLine),
            blameTotalLines: cached.totalLines,
          },
        });
        return;
      }

      const epoch = token.detail;
      set({ fileView: { ...view, blameLoading: true, blameError: null } });
      try {
        const window = await api.fileBlame(project.path, view.path, start, end, view.rev);
        if (epoch !== token.detail) return;
        blameCache.set(key, window);
        const current = get().fileView;
        if (!current || current.path !== view.path) return;
        set({
          fileView: {
            ...current,
            blameHunks: mergeHunks(current.blameHunks, window.hunks),
            blameLines: mergeLines(current.blameLines, window.startLine, window.lines),
            blameLoadedTo: Math.max(current.blameLoadedTo, window.endLine),
            blameTotalLines: window.totalLines,
            blameLoading: false,
            blameError: null,
          },
        });

        // Small/medium files: finish the rest right away so the view never shows
        // a half-blamed file the user has to scroll to complete.
        if (window.totalLines > 0 && window.totalLines <= BLAME_EAGER_LINES) {
          const loaded = get().fileView;
          if (loaded && loaded.blameLoadedTo < window.totalLines) {
            await get().requestBlame(loaded.blameLoadedTo + 1);
          }
        }
      } catch (error) {
        if (epoch !== token.detail) return;
        const current = get().fileView;
        if (!current) return;
        set({
          fileView: {
            ...current,
            blameLoading: false,
            blameError: errorMessage(error),
          },
        });
      }
    },

    async refreshFileView() {
      const key = currentKey();
      if (key) {
        historyCache.delete(key);
        for (const cachedKey of blameCache.keys()) {
          if (cachedKey.startsWith(`${key}::`)) blameCache.delete(cachedKey);
        }
      }
      const view = get().fileView;
      const project = get().activeProject;
      if (!view || !project) return;
      const epoch = ++token.detail;
      const tab = view.tab;
      set({
        fileView: {
          ...view,
          entries: [],
          historyLoading: true,
          selectedSha: null,
          diff: null,
          diffMissing: false,
          blameHunks: [],
          blameLines: [],
          blameLoadedTo: 0,
          blameTotalLines: 0,
          blameLoading: false,
          blameError: null,
        },
      });
      await loadHistory(epoch);
      if (tab === "blame") {
        set((state) => (state.fileView ? { fileView: { ...state.fileView, tab } } : state));
        await get().requestBlame(1);
      }
    },

    closeFileView() {
      token.detail += 1;
      set({ fileView: null });
    },
  };
};