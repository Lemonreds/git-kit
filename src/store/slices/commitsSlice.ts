import type { StateCreator } from "zustand";

import { api } from "../../lib/ipc";
import type { BranchSummary, CommitSummary, TagInfo } from "../../lib/types";
import type { AppState } from "../appStore";
import { cacheKey, clearDetail, commitsCache, errorMessage, feedback, PAGE_SIZE, token } from "../shared";
import type { PaneMode } from "../types";

export interface CommitsSlice {
  pane: PaneMode;
  selectedBranch: BranchSummary | null;
  /** Tag whose history is open; `selectedBranch` is `null` in that case. */
  selectedTag: TagInfo | null;
  commits: CommitSummary[];
  commitsLoading: boolean;
  commitsHasMore: boolean;
  /**
   * Visibility of the commit search bar. It lives in the store (not in the
   * panel) so the ⌘G command can open it from anywhere, including the palette.
   */
  commitSearchOpen: boolean;
  setCommitSearchOpen: (open: boolean) => void;

  openBranch: (refName: string) => Promise<void>;
  openTagCommits: (tag: TagInfo) => Promise<void>;
  /** Back to the branch list, dropping whatever detail was open. */
  openBranches: () => void;
  backToBranches: () => void;
  loadMoreCommits: () => Promise<void>;
}

/** Git revision of the history the middle pane shows: a branch or a tag. */
function historyRev(state: {
  selectedBranch: BranchSummary | null;
  selectedTag: TagInfo | null;
}): string | null {
  if (state.selectedBranch) return state.selectedBranch.refName;
  if (state.selectedTag) return `refs/tags/${state.selectedTag.name}`;
  return null;
}

/** Commit history of the branch the middle pane is showing (paginated, cached). */
export const createCommitsSlice: StateCreator<AppState, [], [], CommitsSlice> = (set, get) => {
  const { notify } = feedback(get);

  return {
    pane: "branches",
    selectedBranch: null,
    selectedTag: null,
    commits: [],
    commitsLoading: false,
    commitsHasMore: false,
    commitSearchOpen: false,

    setCommitSearchOpen(open) {
      set({ commitSearchOpen: open });
    },

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
        selectedTag: null,
        stashPreview: null,
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
        commitSearchOpen: false,
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

    /** History of a tag: same pane and cache as a branch, just another revision. */
    async openTagCommits(tag) {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;

      const refName = `refs/tags/${tag.name}`;
      const key = cacheKey(project.id, refName);
      const cached = commitsCache.get(key);
      const epoch = ++token.detail;

      set({
        pane: "commits",
        selectedBranch: null,
        selectedTag: tag,
        stashPreview: null,
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
        commitSearchOpen: false,
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

    openBranches() {
      set({ ...clearDetail() });
    },

    backToBranches() {
      const { pane, selectedTag } = get();
      if (pane === "branches") return;
      // A tag's history goes back to the tag list, a branch's to the branches.
      const back = selectedTag ? "tags" : "branches";
      set({ ...clearDetail(), pane: back });
    },

    async loadMoreCommits() {
      const state = get();
      const { activeProject, commits, commitsLoading, commitsHasMore } = state;
      const rev = historyRev(state);
      if (!activeProject || !rev || commitsLoading || !commitsHasMore) return;

      set({ commitsLoading: true });
      const epoch = token.detail;
      try {
        const page = await api.listCommits(activeProject.path, rev, commits.length, PAGE_SIZE);
        if (epoch !== token.detail) return;
        const merged = [...get().commits, ...page.commits];
        commitsCache.set(cacheKey(activeProject.id, rev), {
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