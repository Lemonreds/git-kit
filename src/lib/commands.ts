import type { MessageKey } from "../i18n";
import { t } from "../i18n";
import type { AppState } from "../store/appStore";
import { countUnresolved } from "../store/slices/conflictSlice";
import type { Binding, CommandId, Keymap } from "./keymap";

export type CommandGroup = "app" | "navigation" | "repository";

export interface CommandSpec {
  id: CommandId;
  labelKey: MessageKey;
  group: CommandGroup;
  defaultBinding: Binding | null;
  /** Commands that depend on a selection are hidden when there is none. */
  available?: (state: AppState) => boolean;
  /**
   * Handled by the component that owns the keyboard scope (the in-diff finder
   * lives in DiffPanel). Listed here so its binding is editable and deduplicated,
   * but the global dispatcher must not also run it.
   */
  handledLocally?: boolean;
  /** Commands that need a component scope never make sense in the palette. */
  hideInPalette?: boolean;
}

const mod = (key: string, shift = false): Binding => ({ key, mod: true, shift, alt: false });

/**
 * Every shortcut the app owns. The palette, the hotkey dispatcher and the
 * settings pane all read this one list, so a command can never be usable from
 * the keyboard but missing from the palette (or vice versa).
 */
export const COMMANDS: CommandSpec[] = [
  { id: "palette", labelKey: "command.palette", group: "app", defaultBinding: mod("k") },
  { id: "refresh", labelKey: "command.refresh", group: "app", defaultBinding: mod("r") },
  { id: "addProject", labelKey: "command.addProject", group: "app", defaultBinding: mod("o") },
  { id: "settings", labelKey: "command.settings", group: "app", defaultBinding: mod(",") },
  { id: "terminal", labelKey: "command.terminal", group: "app", defaultBinding: mod("j") },
  {
    id: "paneBranches",
    labelKey: "command.paneBranches",
    group: "navigation",
    defaultBinding: mod("1"),
  },
  {
    id: "paneChanges",
    labelKey: "command.paneChanges",
    group: "navigation",
    defaultBinding: mod("2"),
    available: (state) => state.activeProject?.status === "ok",
  },
  {
    id: "paneStash",
    labelKey: "command.paneStash",
    group: "navigation",
    defaultBinding: mod("s", true),
    available: (state) => state.activeProject?.status === "ok",
  },
  {
    id: "paneTags",
    labelKey: "command.paneTags",
    group: "navigation",
    defaultBinding: mod("t", true),
    available: (state) => state.activeProject?.status === "ok",
  },
  {
    id: "paneWorkflows",
    labelKey: "command.paneWorkflows",
    group: "navigation",
    defaultBinding: mod("w", true),
    available: (state) => state.activeProject?.status === "ok",
  },
  {
    id: "commitSearch",
    labelKey: "command.commitSearch",
    group: "navigation",
    defaultBinding: mod("g"),
    // Only the commit list has something to search.
    available: (state) => state.pane === "commits" && state.commits.length > 0,
  },
  {
    id: "fetch",
    labelKey: "command.fetch",
    group: "repository",
    defaultBinding: mod("f", true),
    available: (state) => state.activeProject?.status === "ok",
  },
  {
    id: "fileHistory",
    labelKey: "command.fileHistory",
    group: "repository",
    defaultBinding: mod("h", true),
    available: (state) => Boolean(state.worktreeTarget?.path ?? state.selectedFilePath),
  },
  {
    id: "blame",
    labelKey: "command.blame",
    group: "repository",
    defaultBinding: mod("b", true),
    available: (state) => Boolean(state.worktreeTarget?.path ?? state.selectedFilePath),
  },
  {
    id: "findInDiff",
    labelKey: "command.findInDiff",
    group: "repository",
    defaultBinding: mod("f"),
    available: (state) => Boolean(state.diff || state.worktreeTarget),
    handledLocally: true,
    hideInPalette: true,
  },
  {
    id: "saveConflict",
    labelKey: "command.saveConflict",
    group: "repository",
    defaultBinding: mod("s"),
    available: (state) => Boolean(state.conflictPath),
  },
];

export const COMMAND_GROUPS: Array<{ id: CommandGroup; labelKey: MessageKey }> = [
  { id: "app", labelKey: "command.groupApp" },
  { id: "navigation", labelKey: "command.groupNavigation" },
  { id: "repository", labelKey: "command.groupRepository" },
];

export const COMMAND_BY_ID = new Map(COMMANDS.map((command) => [command.id, command]));

export function defaultKeymap(): Keymap {
  const map = {} as Keymap;
  for (const command of COMMANDS) map[command.id] = command.defaultBinding;
  return map;
}

/** Stored overrides merged over the defaults. */
export function resolveKeymap(overrides: Partial<Keymap>): Keymap {
  return { ...defaultKeymap(), ...overrides };
}

export function isAvailable(command: CommandSpec, state: AppState): boolean {
  return command.available ? command.available(state) : true;
}

/**
 * Runs one command. Returns false when it could not run (nothing selected,
 * repository unavailable) so callers can leave the event unhandled.
 */
export function runCommand(id: CommandId, state: AppState): boolean {
  const command = COMMAND_BY_ID.get(id);
  if (!command || !isAvailable(command, state)) return false;
  if (command.handledLocally) return false;

  switch (id) {
    case "palette":
      state.setPaletteOpen(true);
      return true;
    case "refresh":
      void state.refresh();
      return true;
    case "addProject":
      void state.addProject();
      return true;
    case "settings":
      state.setSettingsOpen(true);
      return true;
    case "terminal":
      state.toggleTerminalPanel();
      return true;
    case "paneBranches":
      state.openBranches();
      return true;
    case "paneChanges":
      void state.openChanges();
      return true;
    case "paneStash":
      state.openStash();
      return true;
    case "paneTags":
      state.openTags();
      return true;
    case "paneWorkflows":
      state.openWorkflows();
      return true;
    case "commitSearch":
      state.setCommitSearchOpen(!state.commitSearchOpen);
      return true;
    case "fetch":
      void state.fetchAll();
      return true;
    case "fileHistory": {
      const target = state.worktreeTarget;
      const path = target?.path ?? state.selectedFilePath;
      if (!path) return false;
      void state.openFileHistory(path, target ? null : state.selectedCommitSha);
      return true;
    }
    case "blame": {
      const target = state.worktreeTarget;
      const path = target?.path ?? state.selectedFilePath;
      if (!path) return false;
      void state.openFileHistory(path, target ? null : state.selectedCommitSha).then(() => {
        state.setFileHistoryTab("blame");
      });
      return true;
    }
    case "saveConflict": {
      if (!state.conflictPath || state.conflictSaving || !state.conflictParsed) return false;
      const unresolved = countUnresolved(state.conflictParsed, state.conflictDrafts);
      if (unresolved > 0) {
        state.notify("info", t("store.conflictUnresolvedFirst", { count: unresolved }));
        return true;
      }
      void state.saveConflict();
      return true;
    }
    default:
      return false;
  }
}