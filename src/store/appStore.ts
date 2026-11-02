import { create } from "zustand";

import { createBranchOpsSlice, type BranchOpsSlice } from "./slices/branchOpsSlice";
import { createBranchSlice, type BranchSlice } from "./slices/branchSlice";
import { createChangesSlice, type ChangesSlice } from "./slices/changesSlice";
import { createCommitsSlice, type CommitsSlice } from "./slices/commitsSlice";
import { createDiffSlice, type DiffSlice } from "./slices/diffSlice";
import { createProjectSlice, type ProjectSlice } from "./slices/projectSlice";
import { createPrefsSlice, type PrefsSlice } from "./slices/prefsSlice";
import { createSettingsSlice, type SettingsSlice } from "./slices/settingsSlice";
import { createTerminalSlice, type TerminalSlice } from "./slices/terminalSlice";
import { createUiSlice, type UiSlice } from "./slices/uiSlice";
import { createWorkflowSlice, type WorkflowSlice } from "./slices/workflowSlice";

export type * from "./types";

/**
 * The store is one object but written as independent slices:
 *
 * - `projectSlice`   projects + active repository (bootstrap / add / remove)
 * - `branchSlice`    branch list, remote branches, checkout / delete / create
 * - `branchOpsSlice` network branch workflow (squash / cherry-pick / push / pull / rebase / fetch)
 * - `commitsSlice`   commit history of the opened branch (pagination)
 * - `diffSlice`      commit files + the rendered diff
 * - `changesSlice`   worktree status and staging
 * - `workflowSlice`  repo operation state, stash, tags, reflog, reset
 * - `settingsSlice`  branch templates, settings dialog, commit identity
 * - `prefsSlice`     app-wide appearance (theme)
 * - `terminalSlice`  built-in terminal tabs, panel height, LRU ceiling
 * - `uiSlice`        toast + alert
 *
 * Components keep subscribing field-by-field (`useAppStore((state) => state.branches)`),
 * or grouped through `useSlice` from `./hooks` — both stay lazily evaluated, so a
 * toast never re-renders the diff view.
 */
export type AppState = ProjectSlice &
  BranchSlice &
  BranchOpsSlice &
  CommitsSlice &
  DiffSlice &
  ChangesSlice &
  WorkflowSlice &
  SettingsSlice &
  PrefsSlice &
  TerminalSlice &
  UiSlice;

export const useAppStore = create<AppState>()((...args) => ({
  ...createProjectSlice(...args),
  ...createBranchSlice(...args),
  ...createBranchOpsSlice(...args),
  ...createCommitsSlice(...args),
  ...createDiffSlice(...args),
  ...createChangesSlice(...args),
  ...createWorkflowSlice(...args),
  ...createSettingsSlice(...args),
  ...createPrefsSlice(...args),
  ...createTerminalSlice(...args),
  ...createUiSlice(...args),
}));