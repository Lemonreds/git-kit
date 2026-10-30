import { open } from "@tauri-apps/plugin-dialog";
import type { StateCreator } from "zustand";

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
  token,
  upsertProject,
} from "../shared";

export interface ProjectSlice {
  booted: boolean;
  projects: Project[];
  projectSort: ProjectSort;
  activeProject: Project | null;

  bootstrap: () => Promise<void>;
  loadProject: (project: Project) => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  addProject: () => Promise<void>;
  relinkProject: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  pinProject: (id: string, pinned: boolean) => Promise<void>;
  setProjectSort: (sort: ProjectSort) => void;
  refresh: () => Promise<void>;
}

/** Project list, the active repository and everything that opens / closes one. */
export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get) => {
  const { notify, fail } = feedback(get);

  return {
    booted: false,
    projects: [],
    projectSort: (localStorage.getItem("gk.projectSort") as ProjectSort | null) ?? "recent",
    activeProject: null,

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
        reflog: [],
        changes: null,
        ...reset,
      });
      if (project.status !== "ok") return;

      // Settle independently: a failed worktree scan must not hide the branch
      // list, and a failed branch scan must not block the repository footer.
      const [snapshotResult, branchesResult, changesResult] = await Promise.allSettled([
        api.repoSnapshot(project.path),
        api.listBranches(project.path),
        api.worktreeStatus(project.path),
      ]);
      if (epoch !== token.project) return;

      const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
      const branches = branchesResult.status === "fulfilled" ? branchesResult.value : [];
      const changes = changesResult.status === "fulfilled" ? changesResult.value : null;

      set((state) => ({
        snapshot,
        branches,
        changes,
        branchesLoading: false,
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
        const selected = await open({
          directory: true,
          multiple: false,
          title: "选择 Git 仓库文件夹",
        });
        if (typeof selected !== "string") return;

        const project = await api.addProject(selected);
        set((state) => ({ projects: upsertProject(state.projects, project) }));
        await get().loadProject(project);
        notify("success", `已添加 ${project.name}`);
      } catch (error) {
        fail("添加项目失败", error);
      }
    },

    async relinkProject(id) {
      const project = get().projects.find((item) => item.id === id);
      if (!project) return;
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: `重新选择「${project.name}」所在文件夹`,
        });
        if (typeof selected !== "string") return;

        const next = await api.relinkProject(id, selected);
        set((state) => ({ projects: upsertProject(state.projects, next) }));
        await get().loadProject(next);
        notify("success", "项目路径已更新");
      } catch (error) {
        fail("更新项目路径失败", error);
      }
    },

    async removeProject(id) {
      try {
        await api.removeProject(id);
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
        fail("移除项目失败", error);
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
        fail(pinned ? "置顶项目失败" : "取消置顶失败", error);
      }
    },

    setProjectSort(sort) {
      localStorage.setItem("gk.projectSort", sort);
      set({ projectSort: sort });
    },

    async refresh() {
      invalidateCaches();
      try {
        const list = await api.listProjects();
        const activeId = get().activeProject?.id ?? list.lastActiveId;
        const active = list.projects.find((project) => project.id === activeId) ?? pickActive(list);
        set({ projects: list.projects, activeProject: null });
        if (active) await get().loadProject(active);
        if (get().pane === "changes") await get().refreshChanges();
        notify("info", "已刷新");
      } catch (error) {
        fail("刷新失败", error);
      }
    },
  };
};