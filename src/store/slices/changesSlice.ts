import type { StateCreator } from "zustand";

import { t } from "../../i18n";
import { api } from "../../lib/ipc";
import type { WorktreeStatus } from "../../lib/types";
import type { AppState } from "../appStore";
import { clearDetail, feedback, invalidateCaches } from "../shared";

export interface ChangesSlice {
  changes: WorktreeStatus | null;
  changesLoading: boolean;

  openChanges: () => Promise<void>;
  refreshChanges: () => Promise<void>;
  stageFile: (path: string) => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  discardFile: (path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  discardAll: () => Promise<void>;
  commitStaged: (message: string) => Promise<boolean>;
}

/** Worktree status (staged / unstaged / untracked) and the staging operations. */
export const createChangesSlice: StateCreator<AppState, [], [], ChangesSlice> = (set, get) => {
  const { notify, fail } = feedback(get);

  /** Single place that writes `changes` + keeps the footer `isDirty` in sync. */
  const syncStatusCache = (changes: WorktreeStatus) => {
    set((state) => ({
      changes,
      snapshot: state.snapshot
        ? { ...state.snapshot, isDirty: changes.entries.length > 0 }
        : state.snapshot,
    }));
  };

  /**
   * Every stage / unstage / discard goes through here: refresh the list, drop
   * stale diff caches and keep (or close) the open worktree diff.
   */
  const applyStatusMutation = async (run: () => Promise<WorktreeStatus>) => {
    const project = get().activeProject;
    if (!project) return;
    try {
      const changes = await run();
      syncStatusCache(changes);
      invalidateCaches();

      const target = get().worktreeTarget;
      if (target) {
        const stillChanged = changes.entries.some((entry) =>
          target.staged ? entry.path === target.path && entry.staged : entry.path === target.path && entry.unstaged,
        );
        if (stillChanged) {
          await get().openWorktreeDiff(target.path, target.staged);
        } else {
          set({ worktreeTarget: null, diff: null, diffLoading: false, selectedFilePath: null });
        }
      }
    } catch (error) {
      fail(t("store.actionFailed"), error);
      await get().refreshChanges();
    }
  };

  return {
    changes: null,
    changesLoading: false,

    async openChanges() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      const reset = clearDetail();
      set({ ...reset, pane: "changes", changesLoading: true });
      await get().refreshChanges();
    },

    async refreshChanges() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      try {
        const changes = await api.worktreeStatus(project.path);
        syncStatusCache(changes);
        void get().refreshRepoState();
      } catch (error) {
        fail(t("store.loadChangesFailed"), error);
      } finally {
        set({ changesLoading: false });
      }
    },

    async stageFile(path) {
      const project = get().activeProject;
      if (!project) return;
      await applyStatusMutation(() => api.stageFile(project.path, path));
    },

    async unstageFile(path) {
      const project = get().activeProject;
      if (!project) return;
      await applyStatusMutation(() => api.unstageFile(project.path, path));
    },

    async discardFile(path) {
      const project = get().activeProject;
      if (!project) return;
      await applyStatusMutation(() => api.discardFile(project.path, path));
      notify("info", t("store.fileDiscarded"));
    },

    async stageAll() {
      const project = get().activeProject;
      if (!project) return;
      await applyStatusMutation(() => api.stageAll(project.path));
    },

    async unstageAll() {
      const project = get().activeProject;
      if (!project) return;
      await applyStatusMutation(() => api.unstageAll(project.path));
    },

    async discardAll() {
      const project = get().activeProject;
      if (!project) return;
      await applyStatusMutation(() => api.discardAll(project.path));
      notify("info", t("store.allDiscarded"));
    },

    async commitStaged(message) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const result = await api.commitStaged(project.path, message);
        invalidateCaches();
        set({ worktreeTarget: null, diff: null, selectedFilePath: null, selectedCommitSha: null });
        await get().refreshChanges();
        await get().refreshBranches();
        notify(
          "success",
          t("store.committed", { sha: result.shortSha, count: result.filesChanged }),
        );
        return true;
      } catch (error) {
        fail(t("store.commitFailed"), error);
        await get().refreshChanges();
        return false;
      }
    },
  };
};