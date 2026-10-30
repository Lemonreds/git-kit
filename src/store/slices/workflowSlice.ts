import type { StateCreator } from "zustand";

import { api, IpcError } from "../../lib/ipc";
import type { ReflogEntry, RepoOperationState, StashEntry, TagInfo } from "../../lib/types";
import type { AppState } from "../appStore";
import { errorMessage, feedback, invalidateCaches } from "../shared";
import type { OpOutcome } from "../types";

export interface WorkflowSlice {
  /** Merge / rebase / cherry-pick / revert that stopped mid-way. */
  repoState: RepoOperationState | null;
  stashEntries: StashEntry[];
  tags: TagInfo[];
  reflog: ReflogEntry[];

  refreshRepoState: () => Promise<void>;
  repoOperation: (action: "continue" | "skip" | "abort") => Promise<boolean>;
  refreshStashes: () => Promise<void>;
  stashPush: (message: string, includeUntracked: boolean) => Promise<boolean>;
  stashPop: (index: number) => Promise<OpOutcome>;
  stashDrop: (index: number) => Promise<boolean>;
  amendCommit: (message: string) => Promise<OpOutcome & { needsForcePush?: boolean }>;
  ignorePath: (path: string, isDir: boolean) => Promise<boolean>;
  mergeBranch: (source: string, noFf: boolean) => Promise<OpOutcome>;
  revertCommit: (sha: string) => Promise<OpOutcome>;
  refreshTags: () => Promise<void>;
  createTag: (name: string, target: string, message: string) => Promise<string | null>;
  deleteTag: (name: string, deleteRemote?: boolean) => Promise<void>;
  pushTag: (name: string) => Promise<boolean>;
  refreshReflog: () => Promise<void>;
  resetTo: (sha: string, hard: boolean) => Promise<boolean>;
}

/**
 * Everything around the repository rather than inside one branch: interrupted
 * operations, stashes, tags, reflog and the history-rewriting actions.
 */
export const createWorkflowSlice: StateCreator<AppState, [], [], WorkflowSlice> = (set, get) => {
  const { notify, fail } = feedback(get);

  return {
    repoState: null,
    stashEntries: [],
    tags: [],
    reflog: [],

    async refreshRepoState() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") {
        set({ repoState: null });
        return;
      }
      try {
        set({ repoState: await api.getRepoState(project.path) });
      } catch {
        set({ repoState: null });
      }
    },

    async repoOperation(action) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const state = await api.repoOperation(project.path, action);
        set({ repoState: state });
        invalidateCaches();
        await get().refreshBranches();
        await get().refreshChanges();
        notify(
          "success",
          action === "abort" ? "已中止该操作" : action === "skip" ? "已跳过当前提交" : "已继续并完成",
        );
        return true;
      } catch (error) {
        fail("操作失败", error);
        await get().refreshRepoState();
        await get().refreshBranches();
        return false;
      }
    },

    async refreshStashes() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      try {
        const list = await api.stashList(project.path);
        set({ stashEntries: list.entries });
      } catch (error) {
        fail("读取暂存列表失败", error);
      }
    },

    async stashPush(message, includeUntracked) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const list = await api.stashPush(project.path, message, includeUntracked);
        set({ stashEntries: list.entries });
        invalidateCaches();
        await get().refreshChanges();
        notify("success", "已暂存当前改动");
        return true;
      } catch (error) {
        fail("暂存改动失败", error);
        return false;
      }
    },

    async stashPop(index) {
      const project = get().activeProject;
      if (!project) return { ok: false };
      try {
        const list = await api.stashPop(project.path, index);
        set({ stashEntries: list.entries });
        invalidateCaches();
        await get().refreshChanges();
        notify("success", "已恢复暂存的改动");
        return { ok: true };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        if (code !== "stash_conflict") fail("恢复暂存失败", error);
        await get().refreshChanges();
        await get().refreshRepoState();
        return { ok: false, code, message };
      }
    },

    async stashDrop(index) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const list = await api.stashDrop(project.path, index);
        set({ stashEntries: list.entries });
        notify("success", "已删除该条 stash");
        return true;
      } catch (error) {
        fail("删除 stash 失败", error);
        return false;
      }
    },

    async amendCommit(message) {
      const project = get().activeProject;
      if (!project) return { ok: false };
      try {
        const result = await api.amendCommit(project.path, message);
        invalidateCaches();
        set({ selectedCommitSha: null, commitFiles: [], diff: null });
        await get().refreshChanges();
        await get().refreshBranches();
        notify("success", `已修正上一次提交 · ${result.shortSha}`);
        return { ok: true, needsForcePush: result.needsForcePush };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        fail("修正提交失败", error);
        return { ok: false, code, message };
      }
    },

    async ignorePath(path, isDir) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        await api.ignorePath(project.path, path, isDir);
        await get().refreshChanges();
        notify("info", `已加入 .gitignore：${path}`);
        return true;
      } catch (error) {
        fail("加入 .gitignore 失败", error);
        return false;
      }
    },

    async mergeBranch(source, noFf) {
      const project = get().activeProject;
      if (!project) return { ok: false };
      try {
        const result = await api.mergeBranch(project.path, source, noFf);
        invalidateCaches();
        set({ worktreeTarget: null, diff: null });
        await get().refreshChanges();
        await get().refreshBranches();
        notify(
          "success",
          result.strategy === "up-to-date"
            ? `${source} 已经在当前分支里`
            : `${result.strategy === "fast-forward" ? "已快进合并" : "已合并"} ${source} · ${result.shortSha}`,
        );
        return { ok: true };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        if (code !== "merge_conflict") fail("合并失败", error);
        await get().refreshChanges();
        await get().refreshRepoState();
        return { ok: false, code, message };
      }
    },

    async revertCommit(sha) {
      const project = get().activeProject;
      if (!project) return { ok: false };
      try {
        const result = await api.revertCommit(project.path, sha);
        invalidateCaches();
        await get().refreshChanges();
        await get().refreshBranches();
        notify("success", `已生成反向提交 ${result.shortSha}`);
        return { ok: true };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        if (code !== "revert_conflict") fail("撤销提交失败", error);
        await get().refreshChanges();
        await get().refreshRepoState();
        return { ok: false, code, message };
      }
    },

    async refreshTags() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      try {
        set({ tags: await api.listTags(project.path) });
      } catch (error) {
        fail("读取标签失败", error);
      }
    },

    async createTag(name, target, message) {
      const project = get().activeProject;
      if (!project) return "没有打开的项目";
      try {
        const tags = await api.createTag(project.path, name, target, message);
        set({ tags });
        notify("success", `已创建标签 ${name}`);
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },

    async deleteTag(name, deleteRemote = false) {
      const project = get().activeProject;
      if (!project) return;
      try {
        const result = await api.deleteTag(project.path, name, deleteRemote);
        set({ tags: result.tags });
        if (result.remoteFailure) {
          // The local tag is already gone — say so instead of a bare error toast.
          get().showAlert(
            `标签 ${name} 已从本地删除`,
            `origin 上的同名标签没有删除：\n${result.remoteFailure}`,
          );
          return;
        }
        notify(
          "success",
          result.remoteDeleted
            ? `已删除本地与 origin 上的标签 ${name}`
            : `已删除标签 ${name}`,
        );
      } catch (error) {
        fail("删除标签失败", error);
      }
    },

    async pushTag(name) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const remote = await api.pushTag(project.path, name);
        notify("success", `已推送标签 ${name} 到 ${remote}`);
        return true;
      } catch (error) {
        fail("推送标签失败", error);
        return false;
      }
    },

    async refreshReflog() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      try {
        set({ reflog: await api.reflogEntries(project.path, 20) });
      } catch (error) {
        fail("读取 reflog 失败", error);
      }
    },

    async resetTo(sha, hard) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const result = await api.resetTo(project.path, sha, hard);
        invalidateCaches();
        set({ worktreeTarget: null, diff: null, selectedCommitSha: null, commitFiles: [] });
        await get().refreshChanges();
        await get().refreshBranches();
        await get().refreshRepoState();
        notify("success", `已${hard ? "强制" : ""}重置到 ${result.shortSha}`);
        return true;
      } catch (error) {
        fail("重置失败", error);
        return false;
      }
    },
  };
};