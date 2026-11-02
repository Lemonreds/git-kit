import type { StateCreator } from "zustand";

import { t } from "../../i18n";
import { api } from "../../lib/ipc";
import type { BranchTemplate, RepoIdentity } from "../../lib/types";
import type { AppState } from "../appStore";
import { errorMessage, feedback } from "../shared";

export interface SettingsSlice {
  templates: BranchTemplate[];
  defaultTemplateId: string | null;
  templatesLoaded: boolean;
  settingsOpen: boolean;

  identity: RepoIdentity | null;
  identityLoading: boolean;

  loadTemplates: () => Promise<void>;
  saveTemplates: (templates: BranchTemplate[], defaultId: string | null) => Promise<boolean>;
  setSettingsOpen: (open: boolean) => void;
  loadIdentity: () => Promise<void>;
  /** Returns an error message to render inline, or null on success. */
  saveIdentity: (name: string, email: string) => Promise<string | null>;
}

/** Branch templates (app-wide), the settings dialog and the repo commit identity. */
export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set, get) => {
  const { notify, fail } = feedback(get);

  return {
    templates: [],
    defaultTemplateId: null,
    templatesLoaded: false,
    settingsOpen: false,
    identity: null,
    identityLoading: false,

    async loadTemplates() {
      try {
        const settings = await api.getSettings();
        set({
          templates: settings.branchTemplates,
          defaultTemplateId: settings.defaultTemplateId,
          templatesLoaded: true,
        });
      } catch (error) {
        set({ templatesLoaded: true });
        fail(t("store.loadTemplatesFailed"), error);
      }
    },

    async saveTemplates(templates, defaultId) {
      try {
        const settings = await api.saveBranchTemplates(templates, defaultId);
        set({
          templates: settings.branchTemplates,
          defaultTemplateId: settings.defaultTemplateId,
          templatesLoaded: true,
        });
        notify("success", t("store.templatesSaved"));
        return true;
      } catch (error) {
        fail(t("store.saveTemplatesFailed"), error);
        return false;
      }
    },

    setSettingsOpen(open) {
      set({ settingsOpen: open });
    },

    async loadIdentity() {
      const project = get().activeProject;
      if (!project || project.status !== "ok") return;
      set({ identityLoading: true });
      try {
        const identity = await api.getRepoIdentity(project.path);
        set({ identity, identityLoading: false });
      } catch (error) {
        set({ identityLoading: false });
        fail(t("store.loadIdentityFailed"), error);
      }
    },

    async saveIdentity(name, email) {
      const project = get().activeProject;
      if (!project) return t("store.noProject");
      try {
        const identity = await api.setRepoIdentity(project.path, name, email);
        set({ identity });
        notify("success", t("store.identityUpdated"));
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
  };
};