import type { StateCreator } from "zustand";

import { api, IpcError } from "../../lib/ipc";
import type { AppState } from "../appStore";
import { errorMessage, feedback, invalidateCaches } from "../shared";
import type { OpOutcome, RebaseOutcome } from "../types";

export interface BranchOpsSlice {
  squashBranch: (branch: string, count: number, message: string) => Promise<boolean>;
  cherryPick: (sourceBranch: string, targetBranch: string, shas: string[]) => Promise<boolean>;
  pushBranch: (branch: string, force: boolean) => Promise<OpOutcome>;
  /** `switchFirst` = checkout the branch before pulling (row action on a non-current branch). */
  pullBranch: (branch: string, allowMerge: boolean, switchFirst?: boolean) => Promise<OpOutcome>;
  /** Resolves with the rebase result when it succeeded, otherwise the error code/message. */
  rebaseBranch: (branch: string, baseRef: string) => Promise<RebaseOutcome>;
  syncBranch: (branch: string) => Promise<boolean>;
  /** `git fetch --all --prune`: refresh every remote-tracking ref of the repo. */
  fetchAll: () => Promise<boolean>;
}

/**
 * Network-facing branch workflow: squash / cherry-pick / push / pull / rebase /
 * fetch. Every action fixes stale refs afterwards, so they all live together.
 */
export const createBranchOpsSlice: StateCreator<AppState, [], [], BranchOpsSlice> = (set, get) => {
  const { notify, fail } = feedback(get);

  return {
    async squashBranch(branch, count, message) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const result = await api.squashCommits(project.path, branch, count, message);
        invalidateCaches();
        await get().refreshBranches();
        await get().refreshChanges();
        const viewed = get().selectedBranch;
        if (viewed?.name === branch) await get().openBranch(viewed.refName);
        notify("success", `已把 ${result.squashed} 个提交压缩为 ${result.shortSha}`);
        return true;
      } catch (error) {
        fail("压缩提交失败", error);
        await get().refreshBranches();
        return false;
      }
    },

    async cherryPick(sourceBranch, targetBranch, shas) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const result = await api.cherryPick(project.path, sourceBranch, targetBranch, shas);
        invalidateCaches();
        await get().refreshBranches();
        await get().refreshChanges();
        const target = get().branches.find((branch) => branch.name === result.targetBranch);
        if (target) await get().openBranch(target.refName);
        notify("success", `已 cherry-pick ${result.picked.length} 个提交到 ${result.targetBranch}`);
        return true;
      } catch (error) {
        fail("cherry-pick 失败", error);
        await get().refreshBranches();
        await get().refreshChanges();
        return false;
      }
    },

    async pushBranch(branch, force) {
      const project = get().activeProject;
      if (!project) return { ok: false };
      try {
        const result = await api.pushBranch(project.path, branch, force);
        await get().refreshBranches();
        notify("success", `${result.forced ? "强制推送" : "推送"} ${branch} → ${result.remote} 完成`);
        return { ok: true };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        // `push_rejected` is expected during the dialog flow: the dialog turns it
        // into the “需要强制推送” step instead of a bare error toast.
        if (code !== "push_rejected") fail("推送失败", error);
        await get().refreshBranches();
        return { ok: false, code, message };
      }
    },

    async pullBranch(branch, allowMerge, switchFirst = false) {
      const project = get().activeProject;
      if (!project) return { ok: false };
      try {
        const result = await api.pullBranch(project.path, branch, allowMerge, switchFirst);
        invalidateCaches();
        set({ worktreeTarget: null, diff: null, selectedFilePath: null });
        await get().refreshChanges();
        await get().refreshBranches();
        const moved = result.switched && result.previousBranch
          ? `（已从 ${result.previousBranch} 切换）`
          : "";
        if (result.strategy === "up-to-date") {
          notify("info", `${branch} 已是最新，没有需要拉取的提交${moved}`);
        } else {
          notify(
            "success",
            `${result.strategy === "merge" ? "已合并" : "已快进拉取"} ${result.incoming} 个远程提交 · ${branch}${moved}`,
          );
        }
        return { ok: true };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        // `pull_conflict` is surfaced inside the dialog with the conflict list.
        if (code !== "pull_conflict") fail("拉取失败", error);
        await get().refreshBranches();
        await get().refreshChanges();
        return { ok: false, code, message };
      }
    },

    async rebaseBranch(branch, baseRef) {
      const project = get().activeProject;
      if (!project) return { ok: false };
      const viewedName = get().selectedBranch?.name ?? null;
      try {
        const result = await api.rebaseBranch(project.path, branch, baseRef);
        invalidateCaches();
        set({ worktreeTarget: null, diff: null, selectedFilePath: null });
        await get().refreshChanges();
        await get().refreshBranches();
        // The commits of the rebased branch changed, so a cached history is stale.
        if (viewedName === branch) {
          const branchRef = get().branches.find((item) => item.name === branch);
          if (branchRef) await get().openBranch(branchRef.refName);
        }
        notify(
          "success",
          `已把 ${result.replayed} 个提交 rebase 到 ${result.base} · ${result.newHead}`,
        );
        return { ok: true, result };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        // `rebase_conflict` is surfaced inside the dialog with the file list.
        if (code !== "rebase_conflict") fail("rebase 失败", error);
        await get().refreshBranches();
        await get().refreshChanges();
        return { ok: false, code, message };
      }
    },

    async syncBranch(branch) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const result = await api.syncBranch(project.path, branch);
        await get().refreshBranches();
        const delta =
          result.ahead !== null && result.behind !== null
            ? ` · 领先 ${result.ahead}，落后 ${result.behind}`
            : "";
        notify("success", `已同步 ${branch} 的远程提交${delta}`);
        return true;
      } catch (error) {
        fail("同步失败", error);
        return false;
      }
    },

    async fetchAll() {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const result = await api.fetchAll(project.path);
        // Remotes moved, so branch/commit views built from old refs are stale.
        const viewedRef = get().selectedBranch?.refName ?? null;
        const viewedWasRemote = get().selectedBranch?.isRemote ?? false;
        invalidateCaches();
        await get().refreshBranches();
        // A remote branch's history may have just moved; local branches cannot.
        if (viewedWasRemote && viewedRef) {
          const stillThere = get().branches.some((branch) => branch.refName === viewedRef);
          if (stillThere) await get().openBranch(viewedRef);
          else get().backToBranches();
        }
        await get().refreshRepoState();
        const names = result.remotes.join("、");
        const updated = result.output.trim().length > 0;
        notify(
          "success",
          updated
            ? `已拉取全部远程引用（${names}）· 分支已更新`
            : `已拉取全部远程引用（${names}）· 已是最新`,
        );
        return true;
      } catch (error) {
        fail("拉取远程引用失败", error);
        return false;
      }
    },
  };
};