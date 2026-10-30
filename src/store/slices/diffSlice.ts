import type { StateCreator } from "zustand";

import { api, IpcError } from "../../lib/ipc";
import type { FileChange, FileDiff } from "../../lib/types";
import type { AppState } from "../appStore";
import { cacheKey, diffCache, errorMessage, feedback, filesCache, token } from "../shared";
import type { DiffMode, WorktreeTarget } from "../types";

export interface DiffSlice {
  selectedCommitSha: string | null;
  commitFiles: FileChange[];
  filesLoading: boolean;
  selectedFilePath: string | null;
  diff: FileDiff | null;
  diffLoading: boolean;
  diffMode: DiffMode;
  worktreeTarget: WorktreeTarget | null;

  selectCommit: (sha: string) => Promise<void>;
  selectFile: (file: FileChange) => Promise<void>;
  setDiffMode: (mode: DiffMode) => void;
  openWorktreeDiff: (path: string, staged: boolean) => Promise<void>;
  /** Re-read the opened commit's file list from disk (drops that commit's caches). */
  refreshCommitFiles: () => Promise<void>;
  /** Re-read the opened worktree file's diff from disk. */
  refreshWorktreeDiff: () => Promise<void>;
}

/**
 * Codes the backend uses when the file list moved under us: the commit tree no
 * longer contains that path, or the worktree change was staged / reverted /
 * re-edited outside the app.
 */
const STALE_DIFF_CODES = new Set(["file_not_changed", "not_found", "commit_not_found", "git_not_found"]);

function isStaleDiffError(error: unknown): boolean {
  return error instanceof IpcError && STALE_DIFF_CODES.has(error.code);
}

/** Commit file list + the rendered diff (also used for worktree files). */
export const createDiffSlice: StateCreator<AppState, [], [], DiffSlice> = (set, get) => {
  const { notify, fail } = feedback(get);

  /** Guards the stale-file path against refreshing in a loop. */
  let refreshingFiles = false;

  /**
   * Re-read the commit's file list. Keeps the selected path when it still
   * exists, otherwise lands on the first file (or clears the diff view).
   */
  const reloadCommitFiles = async () => {
    const project = get().activeProject;
    const sha = get().selectedCommitSha;
    if (!project || !sha) return;

    const epoch = token.detail;
    const keepPath = get().selectedFilePath;
    set({ filesLoading: true });
    try {
      // The tree moved: drop this commit's file list and patches.
      filesCache.delete(cacheKey(project.id, sha));
      const prefix = `${cacheKey(project.id, sha)}::`;
      for (const key of diffCache.keys()) {
        if (key.startsWith(prefix)) diffCache.delete(key);
      }

      const files = await api.getCommitFiles(project.path, sha);
      if (epoch !== token.detail) return;
      filesCache.set(cacheKey(project.id, sha), files);
      set({
        commitFiles: files.files,
        filesLoading: false,
        selectedFilePath: null,
        diff: null,
        diffLoading: false,
      });

      const keep = keepPath ? files.files.find((item) => item.path === keepPath) : undefined;
      const next = keep ?? files.files[0];
      if (next) await get().selectFile(next);
      else notify("info", "刷新后该提交已经没有文件改动");
    } catch (error) {
      if (epoch !== token.detail) return;
      set({ filesLoading: false });
      fail("刷新改动文件列表失败", error);
    }
  };

  const loadWorktreeDiff = async (path: string, staged: boolean, allowRefresh: boolean) => {
    const project = get().activeProject;
    if (!project) return;

    const key = cacheKey("wt", project.id, path, String(staged));
    const cached = diffCache.get(key);
    set({
      worktreeTarget: { path, staged },
      selectedCommitSha: null,
      commitFiles: [],
      selectedFilePath: path,
      diff: cached ?? null,
      diffLoading: !cached,
    });
    if (cached) return;

    try {
      const diff = await api.worktreeDiff(project.path, path, staged);
      diffCache.set(key, diff);
      const target = get().worktreeTarget;
      if (!target || target.path !== path || target.staged !== staged) return;
      set({ diff, diffLoading: false });
    } catch (error) {
      const target = get().worktreeTarget;
      if (!target || target.path !== path) return;
      set({ diffLoading: false });

      if (isStaleDiffError(error) && allowRefresh) {
        // The worktree (or the index) changed behind the list: refresh it and
        // retry once when the same kind of change is still there.
        notify("info", `找不到「${path}」的改动，正在刷新改动列表`);
        await get().refreshChanges();
        const entry = get().changes?.entries.find((item) => item.path === path);
        const stillChanged = staged ? entry?.staged : entry?.unstaged;
        if (stillChanged) {
          await loadWorktreeDiff(path, staged, false);
          return;
        }
        set({ worktreeTarget: null, diff: null, diffLoading: false, selectedFilePath: null });
        return;
      }

      fail("读取文件改动失败", error);
    }
  };

  return {
    selectedCommitSha: null,
    commitFiles: [],
    filesLoading: false,
    selectedFilePath: null,
    diff: null,
    diffLoading: false,
    diffMode: "unified",
    worktreeTarget: null,

    async selectCommit(sha) {
      const project = get().activeProject;
      if (!project) return;
      if (get().selectedCommitSha === sha && get().commitFiles.length > 0 && !get().worktreeTarget) return;

      const epoch = token.detail;
      set({
        selectedCommitSha: sha,
        filesLoading: true,
        commitFiles: [],
        selectedFilePath: null,
        diff: null,
        diffLoading: false,
        worktreeTarget: null,
      });

      const key = cacheKey(project.id, sha);
      try {
        const files = filesCache.get(key) ?? (await api.getCommitFiles(project.path, sha));
        filesCache.set(key, files);
        if (epoch !== token.detail) return;
        set({ commitFiles: files.files, filesLoading: false });
        if (files.files.length > 0) await get().selectFile(files.files[0]);
      } catch (error) {
        if (epoch !== token.detail) return;
        set({ filesLoading: false });
        fail("读取提交改动失败", error);
      }
    },

    async selectFile(file) {
      const { activeProject: project, selectedCommitSha: sha } = get();
      if (!project || !sha) return;

      const epoch = token.detail;
      const key = cacheKey(project.id, sha, file.path);
      const cached = diffCache.get(key);
      set({
        selectedFilePath: file.path,
        worktreeTarget: null,
        diff: cached ?? null,
        diffLoading: !cached,
      });
      if (cached) return;

      try {
        const diff = await api.getFileDiff(project.path, sha, file.path, file.oldPath);
        diffCache.set(key, diff);
        if (epoch !== token.detail || get().selectedFilePath !== file.path) return;
        set({ diff, diffLoading: false });
      } catch (error) {
        if (epoch !== token.detail || get().selectedFilePath !== file.path) return;
        set({ diffLoading: false });

        // A cached file list can outlive the commit tree (amend / replace); pull
        // the fresh list in and let the user land on the same path again.
        if (isStaleDiffError(error) && !refreshingFiles) {
          refreshingFiles = true;
          try {
            notify("info", `找不到「${file.path}」的改动，正在刷新文件列表`);
            await reloadCommitFiles();
          } finally {
            refreshingFiles = false;
          }
          return;
        }

        notify("error", errorMessage(error));
      }
    },

    setDiffMode(mode) {
      set({ diffMode: mode });
    },

    async openWorktreeDiff(path, staged) {
      await loadWorktreeDiff(path, staged, true);
    },

    async refreshCommitFiles() {
      await reloadCommitFiles();
    },

    async refreshWorktreeDiff() {
      const project = get().activeProject;
      const target = get().worktreeTarget;
      if (!project || !target) return;
      diffCache.delete(cacheKey("wt", project.id, target.path, String(target.staged)));
      await loadWorktreeDiff(target.path, target.staged, true);
    },
  };
};