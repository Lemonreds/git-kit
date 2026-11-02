import type { StateCreator } from "zustand";

import { t } from "../../i18n";
import { api } from "../../lib/ipc";
import type { BranchSummary, RepoSnapshot } from "../../lib/types";
import type { AppState } from "../appStore";
import { feedback, invalidateCaches, REMOTE_PAGE, token } from "../shared";
import type { BranchActionResult } from "../types";

export interface BranchSlice {
  snapshot: RepoSnapshot | null;

  branches: BranchSummary[];
  branchesLoading: boolean;
  branchFilter: string;
  remoteBranches: BranchSummary[];
  remoteLoading: boolean;
  /** false = never requested yet (the panel loads the first page on open). */
  remoteLoaded: boolean;
  remoteTotal: number;
  /** How many newest remote branches are shown; the load-more button grows it. */
  remoteLimit: number;

  refreshBranches: () => Promise<void>;
  loadRemoteBranches: () => Promise<void>;
  loadMoreRemoteBranches: () => Promise<void>;
  collapseRemoteBranches: () => void;
  setBranchFilter: (value: string) => void;
  deleteLocalBranches: (
    names: string[],
    forceUnmerged: boolean,
    deleteRemote?: boolean,
  ) => Promise<BranchActionResult>;
  createBranch: (name: string, baseRef: string, checkout?: boolean) => Promise<boolean>;
  switchBranch: (branch: string) => Promise<boolean>;
}

/**
 * Branch list + local ref mutations. Remote-network operations (push / pull /
 * rebase / fetch) live in `branchOpsSlice`: they are long-running and write
 * different state, so keeping them apart keeps this slice small.
 */
export const createBranchSlice: StateCreator<AppState, [], [], BranchSlice> = (set, get) => {
  const { notify, fail } = feedback(get);

  return {
    snapshot: null,
    branches: [],
    branchesLoading: false,
    branchFilter: "",
    remoteBranches: [],
    remoteLoading: false,
    remoteLoaded: false,
    remoteTotal: 0,
    remoteLimit: REMOTE_PAGE,

    async refreshBranches() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      const epoch = token.project;
      try {
        const [snapshot, branches] = await Promise.all([
          api.repoSnapshot(project.path),
          api.listBranches(project.path),
        ]);
        if (epoch !== token.project) return;
        set((state) => ({
          snapshot,
          branches,
          selectedBranch: state.selectedBranch
            ? branches.find((branch) => branch.refName === state.selectedBranch?.refName) ?? null
            : null,
          projects: state.projects.map((item) =>
            item.id === project.id
              ? { ...item, url: snapshot.url, remoteHost: snapshot.remoteHost, headBranch: snapshot.headBranch }
              : item,
          ),
        }));
        // Keep the remote section in sync once the user asked for it.
        if (get().remoteLoaded) await get().loadRemoteBranches();
      } catch (error) {
        fail(t("store.refreshBranchesFailed"), error);
      }
    },

    async loadRemoteBranches() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      const epoch = token.project;
      set({ remoteLoading: true });
      try {
        const page = await api.listRemoteBranches(project.path, get().remoteLimit, 0);
        if (epoch !== token.project) return;
        set({
          remoteBranches: page.branches,
          remoteTotal: page.total,
          remoteLoaded: true,
          remoteLoading: false,
        });
      } catch (error) {
        if (epoch !== token.project) return;
        set({ remoteLoading: false });
        fail(t("store.loadRemoteBranchesFailed"), error);
      }
    },

    /** Reveal the next 10 newest remote branches (local refs only, no network). */
    async loadMoreRemoteBranches() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      const epoch = token.project;
      const limit = get().remoteLimit + REMOTE_PAGE;
      set({ remoteLoading: true, remoteLimit: limit });
      try {
        const page = await api.listRemoteBranches(project.path, limit, 0);
        if (epoch !== token.project) return;
        set({
          remoteBranches: page.branches,
          remoteTotal: page.total,
          remoteLoaded: true,
          remoteLoading: false,
        });
      } catch (error) {
        if (epoch !== token.project) return;
        set({ remoteLoading: false, remoteLimit: Math.max(get().remoteLimit - REMOTE_PAGE, REMOTE_PAGE) });
        fail(t("store.loadMoreRemoteBranchesFailed"), error);
      }
    },

    /** Fold the extra pages away again — keeps the first page, no re-read. */
    collapseRemoteBranches() {
      if (get().remoteLimit <= REMOTE_PAGE) return;
      set({
        remoteLimit: REMOTE_PAGE,
        remoteBranches: get().remoteBranches.slice(0, REMOTE_PAGE),
      });
    },

    setBranchFilter(value) {
      set({ branchFilter: value });
    },

    async deleteLocalBranches(names, forceUnmerged, deleteRemote = false) {
      const project = get().activeProject;
      if (!project) return { ok: false };
      const viewed = get().selectedBranch;
      const viewedName = viewed?.name ?? null;
      try {
        const result = await api.deleteLocalBranches(
          project.path,
          names,
          forceUnmerged,
          deleteRemote,
        );
        invalidateCaches();
        await get().refreshBranches();
        await get().refreshChanges();
        // Close the commit view when the ref it shows was just deleted; a remote
        // counterpart alone disappearing also invalidates the remote branch view.
        if (
          viewedName &&
          (result.deleted.includes(viewedName) ||
            (viewed?.isRemote === true && result.remoteDeleted.includes(viewedName)))
        ) {
          get().backToBranches();
        }
        return {
          ok: true,
          deleted: result.deleted,
          failed: result.failed,
          remoteDeleted: result.remoteDeleted,
          remoteFailed: result.remoteFailed,
        };
      } catch (error) {
        fail(t("store.deleteBranchFailed"), error);
        await get().refreshBranches();
        return { ok: false };
      }
    },

    async createBranch(name, baseRef, checkout = true) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const result = await api.createBranch(project.path, name, baseRef, checkout);
        invalidateCaches();
        await get().refreshBranches();
        if (checkout) {
          await get().refreshChanges();
          const created = get().branches.find((branch) => branch.refName === result.refName);
          if (created) await get().openBranch(created.refName);
          notify("success", t("store.branchCreatedAndSwitched", { branch: result.branch }));
        } else {
          notify("success", t("store.branchCreated", { branch: result.branch }));
        }
        return true;
      } catch (error) {
        fail(t("store.createBranchFailed"), error);
        await get().refreshBranches();
        return false;
      }
    },

    async switchBranch(branch) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        const result = await api.checkoutBranch(project.path, branch);
        invalidateCaches();
        set({ worktreeTarget: null, diff: null, selectedFilePath: null });
        await get().refreshBranches();
        await get().refreshChanges();
        notify(
          "success",
          result.switched
            ? t("store.branchSwitched", { branch: result.branch })
            : t("store.branchAlreadyCurrent", { branch: result.branch }),
        );
        return true;
      } catch (error) {
        fail(t("store.switchBranchFailed"), error);
        await get().refreshBranches();
        await get().refreshChanges();
        return false;
      }
    },
  };
};