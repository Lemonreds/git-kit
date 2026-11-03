import { open } from "@tauri-apps/plugin-dialog";
import type { StateCreator } from "zustand";

import { t } from "../../i18n";
import { api } from "../../lib/ipc";
import type { ProjectSort } from "../../lib/sortProjects";
import type { Project } from "../../lib/types";
import type { AppState } from "../appStore";
import {
  clearDetail,
  errorMessage,
  feedback,
  invalidateCaches,
  pickActive,
  REMOTE_PAGE,
  TAG_PAGE,
  token,
  upsertProject,
} from "../shared";

export interface ProjectSlice {
  booted: boolean;
  projects: Project[];
  projectSort: ProjectSort;
  activeProject: Project | null;
  /** A native folder sheet is open for the "add project" action. */
  addingProject: boolean;
  /** A native folder sheet is open to relink this project. */
  relinkingId: string | null;

  bootstrap: () => Promise<void>;
  loadProject: (project: Project) => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  addProject: () => Promise<void>;
  relinkProject: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  pinProject: (id: string, pinned: boolean) => Promise<void>;
  setProjectSort: (sort: ProjectSort) => void;
  /** A repository refresh (manual ⌘R or the window regaining focus) is running. */
  refreshing: boolean;
  refresh: () => Promise<void>;
  /**
   * Light, non-destructive re-read when the window goes inactive → active: the
   * user may have committed / checked out / fetched from another app, so the
   * lists are stale, but the open commit and diff must survive.
   */
  syncOnFocus: () => Promise<void>;
}

/** Project list, the active repository and everything that opens / closes one. */
export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get) => {
  const { notify, fail } = feedback(get);

  /**
   * The native folder sheet, shared by "add project" and "relink".
   *
   * macOS builds the panel from scratch on every call and runs it as a modal
   * session, so the click looks dead for a few hundred milliseconds. Callers
   * therefore flag themselves busy first (the button that was clicked shows a
   * spinner) and only then hand over to the system panel.
   *
   * The `busy` flag also serialises the two entry points: a second sheet while
   * one is already open would be refused by AppKit and leave the UI stuck.
   */
  let picking = false;
  const pickFolder = async (
    title: string,
    mark: (busy: boolean) => void,
  ): Promise<string | null> => {
    if (picking) return null;
    picking = true;
    mark(true);
    try {
      const selected = await open({ directory: true, multiple: false, title });
      return typeof selected === "string" ? selected : null;
    } finally {
      mark(false);
      picking = false;
    }
  };

  return {
    booted: false,
    projects: [],
    projectSort: (localStorage.getItem("gk.projectSort") as ProjectSort | null) ?? "recent",
    activeProject: null,
    addingProject: false,
    relinkingId: null,
    refreshing: false,

    async bootstrap() {
      if (get().booted) return;
      set({ booted: true });
      void get().loadTemplates();
      try {
        const list = await api.listProjects();
        const active = pickActive(list);
        set({ projects: list.projects, activeProject: active });
        if (active) await get().loadProject(active);
      } catch (error) {
        notify("error", errorMessage(error));
      }
    },

    async loadProject(project) {
      // Another repository: everything cached for the previous one is dead weight.
      invalidateCaches();
      const epoch = ++token.project;
      const reset = clearDetail();
      set({
        activeProject: project,
        snapshot: null,
        branches: [],
        branchesLoading: project.status === "ok",
        branchFilter: "",
        remoteBranches: [],
        remoteLoading: false,
        remoteLoaded: false,
        remoteTotal: 0,
        remoteLimit: REMOTE_PAGE,
        identity: null,
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
        changes: null,
        ...reset,
      });
      if (project.status !== "ok") return;

      // Settle independently: a failed worktree scan must not hide the branch
      // list, and a failed branch scan must not block the repository footer.
      // Tags ride along so the tags pane has its list ready without a second read.
      const [snapshotResult, branchesResult, changesResult, tagsResult] = await Promise.allSettled([
        api.repoSnapshot(project.path),
        api.listBranches(project.path),
        api.worktreeStatus(project.path),
        api.listTags(project.path),
      ]);
      if (epoch !== token.project) return;

      const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
      const branches = branchesResult.status === "fulfilled" ? branchesResult.value : [];
      const changes = changesResult.status === "fulfilled" ? changesResult.value : null;
      const tags = tagsResult.status === "fulfilled" ? tagsResult.value : [];

      set((state) => ({
        snapshot,
        branches,
        changes,
        tags,
        branchesLoading: false,
        tagsLoading: false,
        projects: state.projects.map((item) =>
          item.id === project.id && snapshot
            ? {
                ...item,
                url: snapshot.url,
                remoteHost: snapshot.remoteHost,
                headBranch: snapshot.headBranch,
                status: "ok" as const,
                statusHint: undefined,
              }
            : item,
        ),
      }));

      const failure =
        branchesResult.status === "rejected"
          ? branchesResult.reason
          : snapshotResult.status === "rejected"
            ? snapshotResult.reason
            : null;
      if (failure) notify("error", errorMessage(failure));
    },

    async selectProject(id) {
      const project = get().projects.find((item) => item.id === id);
      if (!project || project.id === get().activeProject?.id) return;
      void api.setActiveProject(id).catch(() => undefined);
      await get().loadProject(project);
    },

    async addProject() {
      try {
        const selected = await pickFolder(t("store.chooseRepoFolder"), (busy) =>
          set({ addingProject: busy }),
        );
        if (selected === null) return;

        const project = await api.addProject(selected);
        set((state) => ({ projects: upsertProject(state.projects, project) }));
        await get().loadProject(project);
        notify("success", t("store.projectAdded", { name: project.name }));
      } catch (error) {
        fail(t("store.addProjectFailed"), error);
      }
    },

    async relinkProject(id) {
      const project = get().projects.find((item) => item.id === id);
      if (!project) return;
      try {
        const selected = await pickFolder(
          t("store.relinkFolderTitle", { name: project.name }),
          (busy) => set({ relinkingId: busy ? id : null }),
        );
        if (selected === null) return;

        const next = await api.relinkProject(id, selected);
        // The shell sits in the old working directory, which may no longer exist.
        get().closeProjectTerminals(id);
        set((state) => ({ projects: upsertProject(state.projects, next) }));
        await get().loadProject(next);
        notify("success", t("store.projectPathUpdated"));
      } catch (error) {
        fail(t("store.relinkFailed"), error);
      }
    },

    async removeProject(id) {
      try {
        await api.removeProject(id);
        get().closeProjectTerminals(id);
        const remaining = get().projects.filter((project) => project.id !== id);
        const wasActive = get().activeProject?.id === id;
        set({ projects: remaining });
        if (!wasActive) return;

        token.project += 1;
        // Nothing is left to look at, so release the per-branch / per-file caches.
        invalidateCaches();
        const next = remaining.find((project) => project.status === "ok") ?? remaining[0] ?? null;
        set({
          activeProject: null,
          snapshot: null,
          branches: [],
          branchesLoading: false,
          changes: null,
          remoteBranches: [],
          remoteLoading: false,
          remoteLoaded: false,
          remoteTotal: 0,
          remoteLimit: REMOTE_PAGE,
          identity: null,
          ...clearDetail(),
        });
        if (next) await get().loadProject(next);
      } catch (error) {
        fail(t("store.removeProjectFailed"), error);
      }
    },

    async pinProject(id, pinned) {
      const previous = get().projects;
      // Optimistic: the sidebar must not flicker while the JSON is written.
      set((state) => ({
        projects: state.projects.map((project) =>
          project.id === id
            ? { ...project, pinned, pinnedAt: pinned ? Date.now() / 1000 : null }
            : project,
        ),
      }));
      try {
        const updated = await api.setProjectPinned(id, pinned);
        set((state) => ({
          projects: state.projects.map((project) => (project.id === id ? updated : project)),
        }));
      } catch (error) {
        set({ projects: previous });
        fail(t(pinned ? "store.pinFailed" : "store.unpinFailed"), error);
      }
    },

    setProjectSort(sort) {
      localStorage.setItem("gk.projectSort", sort);
      set({ projectSort: sort });
    },

    async refresh() {
      if (get().refreshing) return;
      set({ refreshing: true });
      invalidateCaches();
      try {
        const list = await api.listProjects();
        const activeId = get().activeProject?.id ?? list.lastActiveId;
        const active = list.projects.find((project) => project.id === activeId) ?? pickActive(list);
        set({ projects: list.projects, activeProject: null });
        if (active) await get().loadProject(active);
        if (get().pane === "changes") await get().refreshChanges();
        if (get().pane === "tags") await get().refreshTags();
        notify("info", t("store.refreshed"));
      } catch (error) {
        fail(t("store.refreshFailed"), error);
      } finally {
        set({ refreshing: false });
      }
    },

    async syncOnFocus() {
      const project = get().activeProject;
      if (!project || project.status !== "ok" || get().refreshing) return;

      // No `token` bump: a `loadProject` that is still in flight owns the state.
      // Read the epoch instead and drop the answer if it moved on.
      const epoch = token.project;
      set({ refreshing: true });
      const [snapshot, branches, changes] = await Promise.allSettled([
        api.repoSnapshot(project.path),
        api.listBranches(project.path),
        api.worktreeStatus(project.path),
      ]);
      if (epoch !== token.project) {
        set({ refreshing: false });
        return;
      }

      // Every list keeps its previous value when its own read failed: one bad
      // command must not blank the whole sidebar.
      set((state) => {
        const nextSnapshot = snapshot.status === "fulfilled" ? snapshot.value : state.snapshot;
        const nextChanges = changes.status === "fulfilled" ? changes.value : state.changes;
        return {
          snapshot: nextSnapshot
            ? { ...nextSnapshot, isDirty: nextChanges ? nextChanges.entries.length > 0 : nextSnapshot.isDirty }
            : nextSnapshot,
          changes: nextChanges,
          branches: branches.status === "fulfilled" ? branches.value : state.branches,
          projects:
            state.activeProject && nextSnapshot
              ? state.projects.map((item) =>
                  item.id === state.activeProject?.id
                    ? {
                        ...item,
                        url: nextSnapshot.url,
                        remoteHost: nextSnapshot.remoteHost,
                        headBranch: nextSnapshot.headBranch,
                        status: "ok" as const,
                        statusHint: undefined,
                      }
                    : item,
                )
              : state.projects,
        };
      });
      set({ refreshing: false });
      void get().refreshRepoState();
      if (get().pane === "tags") void get().refreshTags();
    },
  };
};