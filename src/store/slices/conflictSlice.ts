import type { StateCreator } from "zustand";

import { t } from "../../i18n";
import { api } from "../../lib/ipc";
import { assembleConflictFile, draftForChoice, parseConflictFile } from "../../lib/parseConflicts";
import type { ConflictBlock, ParsedConflictFile } from "../../lib/parseConflicts";
import type { ConflictFile, ConflictFileDetail } from "../../lib/types";
import type { AppState } from "../appStore";
import { feedback, invalidateCaches } from "../shared";

export type ConflictChoice = "ours" | "theirs" | "both" | "bothReverse";

/** Draft text of one resolved block, keyed by `ConflictBlock.id`. */
export type ConflictDrafts = Record<string, string>;

export interface ConflictSlice {
  /** Every conflicted path of the repository (navigation + "next conflict"). */
  conflictFiles: ConflictFile[];
  conflictFilesLoading: boolean;
  /** Path currently open in the resolver; `null` = resolver closed. */
  conflictPath: string | null;
  conflictDetail: ConflictFileDetail | null;
  /** Parsed worktree text: the single copy of the file held while resolving. */
  conflictParsed: ParsedConflictFile | null;
  conflictDrafts: ConflictDrafts;
  conflictLoading: boolean;
  conflictSaving: boolean;

  /** Open the resolver for `path` (loads the file list when needed). */
  openConflict: (path: string) => Promise<void>;
  /** Re-read the same path from disk, dropping every draft. */
  refreshConflict: () => Promise<void>;
  chooseConflictSide: (blockId: string, choice: ConflictChoice) => void;
  setConflictDraft: (blockId: string, text: string) => void;
  resetConflictDraft: (blockId: string) => void;
  /** Append one line of our / their side to the draft (line-level picking). */
  appendConflictLine: (blockId: string, side: "ours" | "theirs", line: number) => void;
  applyAllConflictSides: (choice: "ours" | "theirs") => void;
  /** Write the assembled file and stage it. `allowUnresolved` writes markers as-is. */
  saveConflict: (allowUnresolved?: boolean) => Promise<boolean>;
  /** Whole-file choice: accept one side or delete the path. */
  resolveConflictSide: (side: "ours" | "theirs" | "delete") => Promise<boolean>;
  /** Move to the next / previous conflicted file. */
  stepConflict: (delta: number) => Promise<void>;
  closeConflict: () => void;
}

/** Blocks without a draft still carry their markers. */
export function countUnresolved(
  parsed: ParsedConflictFile | null,
  drafts: ConflictDrafts,
): number {
  if (!parsed) return 0;
  return parsed.blocks.filter((block) => drafts[block.id] === undefined).length;
}

export function conflictBlockById(
  parsed: ParsedConflictFile | null,
  blockId: string,
): ConflictBlock | null {
  return parsed?.blocks.find((block) => block.id === blockId) ?? null;
}

/**
 * The conflict resolver. One path is open at a time; the file list is kept so the
 * header can show "2/5" and move between conflicted files without a round trip.
 */
export const createConflictSlice: StateCreator<AppState, [], [], ConflictSlice> = (set, get) => {
  const { notify, fail } = feedback(get);

  const loadFiles = async (repoPath: string) => {
    set({ conflictFilesLoading: true });
    try {
      const files = await api.listConflicts(repoPath);
      set({ conflictFiles: files, conflictFilesLoading: false });
      return files;
    } catch (error) {
      set({ conflictFilesLoading: false });
      fail(t("store.loadConflictsFailed"), error);
      return [];
    }
  };

  const load = async (path: string) => {
    const project = get().activeProject;
    if (!project || project.status !== "ok") return;
    if (get().conflictFiles.length === 0) void loadFiles(project.path);

    set({
      conflictPath: path,
      conflictDetail: null,
      conflictParsed: null,
      conflictDrafts: {},
      conflictLoading: true,
    });

    try {
      const detail = await api.getConflictFile(project.path, path);
      // A different path was opened while this one was loading.
      if (get().conflictPath !== path) return;
      const parsed = detail.worktreeText === null ? null : parseConflictFile(detail.worktreeText);
      set({
        conflictDetail: detail,
        conflictParsed: parsed,
        conflictLoading: false,
      });
    } catch (error) {
      if (get().conflictPath !== path) return;
      set({ conflictLoading: false });
      fail(t("store.loadConflictFailed"), error);
    }
  };

  /** Drop the cached worktree diff of `path`; it is stale after any resolution. */
  const clearWorktreeDiff = (path: string) => {
    const target = get().worktreeTarget;
    invalidateCaches();
    if (target?.path === path) {
      set({ worktreeTarget: null, diff: null, diffLoading: false, selectedFilePath: null });
    }
  };

  const afterResolve = async (path: string) => {
    clearWorktreeDiff(path);
    await get().refreshChanges();
  };

  return {
    conflictFiles: [],
    conflictFilesLoading: false,
    conflictPath: null,
    conflictDetail: null,
    conflictParsed: null,
    conflictDrafts: {},
    conflictLoading: false,
    conflictSaving: false,

    async openConflict(path) {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      await loadFiles(project.path);
      await load(path);
    },

    async refreshConflict() {
      const path = get().conflictPath;
      if (path) await load(path);
    },

    chooseConflictSide(blockId, choice) {
      const parsed = get().conflictParsed;
      const block = conflictBlockById(parsed, blockId);
      if (!parsed || !block) return;
      set((state) => ({
        conflictDrafts: {
          ...state.conflictDrafts,
          [blockId]: draftForChoice(parsed, block, choice),
        },
      }));
    },

    setConflictDraft(blockId, text) {
      set((state) => ({
        conflictDrafts: { ...state.conflictDrafts, [blockId]: text },
      }));
    },

    resetConflictDraft(blockId) {
      set((state) => {
        const drafts = { ...state.conflictDrafts };
        delete drafts[blockId];
        return { conflictDrafts: drafts };
      });
    },

    appendConflictLine(blockId, side, line) {
      const parsed = get().conflictParsed;
      const block = conflictBlockById(parsed, blockId);
      if (!parsed || !block) return;
      const range = side === "ours" ? block.ours : block.theirs;
      if (line < range[0] || line >= range[1]) return;
      const text = parsed.lines[line];
      set((state) => {
        const current = state.conflictDrafts[blockId];
        const next = current === undefined || current.length === 0 ? text : `${current}\n${text}`;
        return { conflictDrafts: { ...state.conflictDrafts, [blockId]: next } };
      });
    },

    applyAllConflictSides(choice) {
      const parsed = get().conflictParsed;
      if (!parsed) return;
      const drafts: ConflictDrafts = { ...get().conflictDrafts };
      for (const block of parsed.blocks) {
        drafts[block.id] = draftForChoice(parsed, block, choice);
      }
      set({ conflictDrafts: drafts });
    },

    async saveConflict(allowUnresolved = false) {
      const project = get().activeProject;
      const {
        conflictPath: path,
        conflictParsed: parsed,
        conflictDetail: detail,
        conflictSaving,
      } = get();
      if (!project || !path || !parsed || conflictSaving) return false;
      // A truncated read must never be written back: it would cut the file.
      if (!detail?.complete || parsed.lines.length === 0) return false;
      if (countUnresolved(parsed, get().conflictDrafts) > 0 && !allowUnresolved) return false;

      const { content } = assembleConflictFile(parsed, get().conflictDrafts);
      set({ conflictSaving: true });
      try {
        const state = await api.resolveConflict(project.path, path, content);
        set({ repoState: state, conflictSaving: false });
        await afterResolve(path);

        const remaining = state.conflicts;
        if (remaining.length > 0) {
          notify("success", t("store.conflictSaved", { path }));
          // Land on the next conflicted file instead of leaving a resolved one
          // open — that is what "resolve them in a row" expects.
          set({ conflictFiles: get().conflictFiles.filter((file) => file.path !== path) });
          await get().openConflict(remaining[0]);
        } else {
          notify("success", t("store.conflictAllSaved"));
          set({
            conflictPath: null,
            conflictDetail: null,
            conflictParsed: null,
            conflictDrafts: {},
          });
          await loadFiles(project.path);
        }
        void get().refreshRepoState();
        return true;
      } catch (error) {
        set({ conflictSaving: false });
        fail(t("store.saveConflictFailed"), error);
        return false;
      }
    },

    async resolveConflictSide(side) {
      const project = get().activeProject;
      const path = get().conflictPath;
      if (!project || !path) return false;
      set({ conflictSaving: true });
      try {
        const state = await api.resolveConflictSide(project.path, path, side);
        set({ repoState: state, conflictSaving: false });
        await afterResolve(path);
        notify("success", t("store.conflictSaved", { path }));
        if (state.conflicts.length > 0) {
          set({ conflictFiles: get().conflictFiles.filter((file) => file.path !== path) });
          await get().openConflict(state.conflicts[0]);
        } else {
          set({
            conflictPath: null,
            conflictDetail: null,
            conflictParsed: null,
            conflictDrafts: {},
          });
          await loadFiles(project.path);
        }
        return true;
      } catch (error) {
        set({ conflictSaving: false });
        fail(t("store.saveConflictFailed"), error);
        return false;
      }
    },

    async stepConflict(delta) {
      const path = get().conflictPath;
      const files = get().conflictFiles;
      if (!path) return;
      const index = files.findIndex((file) => file.path === path);
      if (index === -1) {
        if (files.length > 0) await load(files[0].path);
        return;
      }
      const next = files[(index + delta + files.length) % files.length];
      if (next && next.path !== path) await load(next.path);
    },

    closeConflict() {
      set({
        conflictPath: null,
        conflictDetail: null,
        conflictParsed: null,
        conflictDrafts: {},
        conflictLoading: false,
      });
    },
  };
};

/** Re-exported so the view can show the resolved draft of one block cheaply. */
export function draftOf(drafts: ConflictDrafts, block: ConflictBlock): string | undefined {
  return drafts[block.id];
}