import type { StateCreator } from "zustand";

import { api } from "../../lib/ipc";
import type { BranchSummary, CommitSummary } from "../../lib/types";
import type { AppState } from "../appStore";
import { cacheKey, clearDetail, commitsCache, errorMessage, feedback, PAGE_SIZE, token } from "../shared";
import type { PaneMode } from "../types";

export interface CommitsSlice {
  pane: PaneMode;
  selectedBranch: BranchSummary | null;
  commits: CommitSummary[];
  commitsLoading: boolean;
  commitsHasMore: boolean;

  openBranch: (refName: string) => Promise<void>;
  backToBranches: () => void;
  loadMoreCommits: () => Promise<void>;
}

/** Commit history of the branch the middle pane is showing (paginated, cached). */
export const createCommitsSlice: StateCreator<AppState, [], [], CommitsSlice> = (set, get) => {
  const { notify } = feedback(get);

  return {
    pane: "branches",
    selectedBranch: null,
    commits: [],
    commitsLoading: false,
    commitsHasMore: false,

    async openBranch(refName) {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;

      const branch = get().branches.find((item) => item.refName === refName) ?? null;
      const key = cacheKey(project.id, refName);
      const cached = commitsCache.get(key);
      const epoch = ++token.detail;

      set({
        pane: "commits",
        selectedBranch: branch,
        selectedCommitSha: null,
        commitFiles: [],
        filesLoading: false,
        selectedFilePath: null,
        diff: null,
        diffLoading: false,
        worktreeTarget: null,
        commits: cached?.commits ?? [],
        commitsHasMore: cached?.hasMore ?? false,
        commitsLoading: !cached,
        branchFilter: "",
      });

      if (cached) return;

      try {
        const page = await api.listCommits(project.path, refName, 0, PAGE_SIZE);
        commitsCache.set(key, page);
        if (epoch !== token.detail) return;
        set({ commits: page.commits, commitsHasMore: page.hasMore, commitsLoading: false });
      } catch (error) {
        if (epoch !== token.detail) return;
        set({ commitsLoading: false });
        notify("error", errorMessage(error));
      }
    },

    backToBranches() {
      const { pane } = get();
      if (pane === "branches") return;
      set({ ...clearDetail(), pane: "branches" });
    },

    async loadMoreCommits() {
      const { activeProject, selectedBranch, commits, commitsLoading, commitsHasMore } = get();
      if (!activeProject || !selectedBranch || commitsLoading || !commitsHasMore) return;

      set({ commitsLoading: true });
      const epoch = token.detail;
      try {
        const page = await api.listCommits(
          activeProject.path,
          selectedBranch.refName,
          commits.length,
          PAGE_SIZE,
        );
        if (epoch !== token.detail) return;
        const merged = [...get().commits, ...page.commits];
        commitsCache.set(cacheKey(activeProject.id, selectedBranch.refName), {
          commits: merged,
          hasMore: page.hasMore,
        });
        set({ commits: merged, commitsHasMore: page.hasMore, commitsLoading: false });
      } catch (error) {
        if (epoch !== token.detail) return;
        set({ commitsLoading: false });
        notify("error", errorMessage(error));
      }
    },
  };
};