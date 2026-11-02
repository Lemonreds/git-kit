import type { StateCreator } from "zustand";

import { t } from "../../i18n";
import { api, IpcError } from "../../lib/ipc";
import type { ReflogEntry, RepoOperationState, StashEntry, TagInfo } from "../../lib/types";
import type { AppState } from "../appStore";
import { clearDetail, errorMessage, feedback, invalidateCaches, TAG_PAGE } from "../shared";
import type { OpOutcome } from "../types";

export interface WorkflowSlice {
  /** Merge / rebase / cherry-pick / revert that stopped mid-way. */
  repoState: RepoOperationState | null;
  stashEntries: StashEntry[];
  tags: TagInfo[];
  tagsLoading: boolean;
  /** How many tags the list currently renders; "load more" grows it by TAG_PAGE. */
  tagLimit: number;
  /** Tag filter of the tags pane (name / message / sha / commit summary). */
  tagFilter: string;
  /**
   * Target a pending create form should point at (a commit sha or branch name).
   * Set by "tag this commit" style entry points, cleared when the form closes.
   */
  tagTarget: string | null;
  /** Tag with an operation in flight (push / delete), rendered as a spinner. */
  tagBusy: string | null;
  /** True while `git push --tags` runs. */
  tagPushingAll: boolean;
  /** Last `git ls-remote --tags` result; `null` = never synced this project. */
  tagRemote: TagRemoteState | null;
  tagRemoteLoading: boolean;
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
  /** Open the tags pane of the middle column; `newTagTarget` pre-fills the form. */
  openTags: (newTagTarget?: string | null) => void;
  clearTagTarget: () => void;
  setTagFilter: (filter: string) => void;
  /** Reveal the next TAG_PAGE tags at the bottom of the list. */
  loadMoreTags: () => void;
  /** Back to the first page (new keyword / remote filter / project). */
  resetTagPage: () => void;
  refreshTags: () => Promise<void>;
  createTag: (name: string, target: string, message: string) => Promise<string | null>;
  deleteTag: (name: string, deleteRemote?: boolean) => Promise<void>;
  pushTag: (name: string) => Promise<boolean>;
  pushAllTags: () => Promise<boolean>;
  syncRemoteTags: () => Promise<void>;
  refreshReflog: () => Promise<void>;
  resetTo: (sha: string, hard: boolean) => Promise<boolean>;
}

/** Last remote tag read: `git ls-remote --tags` is the one tag read that nets. */
export interface TagRemoteState {
  /** Remote the list came from; `null` when the repository has no remote. */
  remote: string | null;
  /** Remote tag name -> peeled commit sha. */
  tags: Record<string, string>;
  /** Why the list is empty, when the read failed softly. */
  failure: string | null;
  syncedAt: number;
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
    tagsLoading: false,
    tagLimit: TAG_PAGE,
    tagFilter: "",
    tagTarget: null,
    tagBusy: null,
    tagPushingAll: false,
    tagRemote: null,
    tagRemoteLoading: false,
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
          t(
            action === "abort"
              ? "store.opAborted"
              : action === "skip"
                ? "store.opSkipped"
                : "store.opContinued",
          ),
        );
        return true;
      } catch (error) {
        fail(t("store.actionFailed"), error);
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
        fail(t("store.loadStashesFailed"), error);
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
        notify("success", t("store.stashed"));
        return true;
      } catch (error) {
        fail(t("store.stashFailed"), error);
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
        notify("success", t("store.stashRestored"));
        return { ok: true };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        if (code !== "stash_conflict") fail(t("store.stashRestoreFailed"), error);
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
        notify("success", t("store.stashDropped"));
        return true;
      } catch (error) {
        fail(t("store.stashDropFailed"), error);
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
        notify("success", t("store.amended", { sha: result.shortSha }));
        return { ok: true, needsForcePush: result.needsForcePush };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        fail(t("store.amendFailed"), error);
        return { ok: false, code, message };
      }
    },

    async ignorePath(path, isDir) {
      const project = get().activeProject;
      if (!project) return false;
      try {
        await api.ignorePath(project.path, path, isDir);
        await get().refreshChanges();
        notify("info", t("store.ignored", { path }));
        return true;
      } catch (error) {
        fail(t("store.ignoreFailed"), error);
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
            ? t("store.mergeUpToDate", { source })
            : t(
                result.strategy === "fast-forward" ? "store.mergeFastForwarded" : "store.merged",
                { source, sha: result.shortSha },
              ),
        );
        return { ok: true };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        if (code !== "merge_conflict") fail(t("store.mergeFailed"), error);
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
        notify("success", t("store.reverted", { sha: result.shortSha }));
        return { ok: true };
      } catch (error) {
        const code = error instanceof IpcError ? error.code : "unknown";
        const message = errorMessage(error);
        if (code !== "revert_conflict") fail(t("store.revertFailed"), error);
        await get().refreshChanges();
        await get().refreshRepoState();
        return { ok: false, code, message };
      }
    },

    openTags(newTagTarget) {
      // Leaving the commit / diff detail behind keeps the diff column from
      // showing a file of a view the user just closed.
      set({
        ...clearDetail(),
        pane: "tags",
        tagFilter: "",
        tagLimit: TAG_PAGE,
        tagTarget: newTagTarget ?? null,
      });
    },

    clearTagTarget() {
      set({ tagTarget: null });
    },

    setTagFilter(filter) {
      // A new keyword is a new result set: start it at the first page.
      set({ tagFilter: filter, tagLimit: TAG_PAGE });
    },

    loadMoreTags() {
      const { tagLimit, tags } = get();
      if (tagLimit >= tags.length) return;
      set({ tagLimit: tagLimit + TAG_PAGE });
    },

    resetTagPage() {
      if (get().tagLimit === TAG_PAGE) return;
      set({ tagLimit: TAG_PAGE });
    },

    async refreshTags() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      set({ tagsLoading: true });
      try {
        const tags = await api.listTags(project.path);
        // A refresh can shrink the list (tags deleted in a terminal): clamp the
        // page instead of resetting it, so a user who loaded 60 rows keeps them.
        set({
          tags,
          tagsLoading: false,
          tagLimit: Math.min(get().tagLimit, Math.max(tags.length, TAG_PAGE)),
        });
      } catch (error) {
        set({ tagsLoading: false });
        fail(t("store.loadTagsFailed"), error);
      }
    },

    async createTag(name, target, message) {
      const project = get().activeProject;
      if (!project) return t("store.noProject");
      try {
        const tags = await api.createTag(project.path, name, target, message);
        // A brand new tag only exists locally: mark it as "not pushed" instead
        // of forcing another `ls-remote` round trip.
        const remote = get().tagRemote;
        if (remote && remote.tags[name]) {
          const remaining = { ...remote.tags };
          delete remaining[name];
          set({ tagRemote: { ...remote, tags: remaining } });
        }
        set({ tags });
        notify("success", t("store.tagCreated", { name }));
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },

    async deleteTag(name, deleteRemote = false) {
      const project = get().activeProject;
      if (!project || get().tagBusy) return;
      set({ tagBusy: name });
      try {
        const result = await api.deleteTag(project.path, name, deleteRemote);
        const remote = get().tagRemote;
        let tagRemote = remote;
        if (remote && result.remoteDeleted && remote.tags[name]) {
          const remaining = { ...remote.tags };
          delete remaining[name];
          tagRemote = { ...remote, tags: remaining };
        }
        set({ tags: result.tags, tagRemote, tagBusy: null });
        if (result.remoteFailure) {
          // The local tag is already gone — say so instead of a bare error toast.
          get().showAlert(
            t("store.tagDeletedLocallyTitle", { name }),
            t("store.tagRemoteDeleteFailed", { error: result.remoteFailure }),
          );
          return;
        }
        notify(
          "success",
          result.remoteDeleted
            ? t("store.tagDeletedBoth", { name })
            : t("store.tagDeleted", { name }),
        );
      } catch (error) {
        set({ tagBusy: null });
        fail(t("store.deleteTagFailed"), error);
      }
    },

    async pushTag(name) {
      const project = get().activeProject;
      if (!project || get().tagBusy) return false;
      set({ tagBusy: name });
      try {
        const remote = await api.pushTag(project.path, name);
        const tagRemote = get().tagRemote;
        const local = get().tags.find((tag) => tag.name === name);
        set({
          tagBusy: null,
          tagRemote:
            tagRemote && local
              ? { ...tagRemote, tags: { ...tagRemote.tags, [name]: local.sha } }
              : tagRemote,
        });
        notify("success", t("store.tagPushed", { name, remote }));
        return true;
      } catch (error) {
        set({ tagBusy: null });
        fail(t("store.pushTagFailed"), error);
        return false;
      }
    },

    async pushAllTags() {
      const project = get().activeProject;
      if (!project || get().tagPushingAll) return false;
      set({ tagPushingAll: true });
      try {
        const result = await api.pushAllTags(project.path);
        // Everything local now exists on the remote, so the tags of the last
        // sync plus every local tag is an accurate remote view — no need to ask
        // the user to press "sync" right after pushing.
        const tagRemote = get().tagRemote;
        const pushed: Record<string, string> = { ...(tagRemote?.tags ?? {}) };
        for (const tag of get().tags) pushed[tag.name] = tag.sha;
        set({
          tagPushingAll: false,
          tagRemote: {
            remote: result.remote,
            tags: pushed,
            failure: null,
            syncedAt: Date.now(),
          },
        });
        notify(
          "success",
          t("store.tagsPushedAll", { count: result.pushed, remote: result.remote }),
        );
        return true;
      } catch (error) {
        set({ tagPushingAll: false });
        fail(t("store.pushTagsAllFailed"), error);
        return false;
      }
    },

    async syncRemoteTags() {
      const project = get().activeProject;
      if (!project || project.status !== "ok" || get().tagRemoteLoading) return;
      set({ tagRemoteLoading: true });
      try {
        const page = await api.listRemoteTags(project.path);
        const tags: Record<string, string> = {};
        for (const tag of page.tags) tags[tag.name] = tag.sha;
        set({
          tagRemoteLoading: false,
          tagRemote: { remote: page.remote, tags, failure: page.failure, syncedAt: Date.now() },
        });
        if (page.failure) notify("error", t("store.tagRemoteReadFailed"));
      } catch (error) {
        set({ tagRemoteLoading: false });
        fail(t("store.tagRemoteReadFailed"), error);
      }
    },

    async refreshReflog() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      try {
        set({ reflog: await api.reflogEntries(project.path, 20) });
      } catch (error) {
        fail(t("store.loadReflogFailed"), error);
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
        notify(
          "success",
          t(hard ? "store.resetHard" : "store.reset", { sha: result.shortSha }),
        );
        return true;
      } catch (error) {
        fail(t("store.resetFailed"), error);
        return false;
      }
    },
  };
};