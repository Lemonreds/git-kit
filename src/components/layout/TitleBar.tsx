import { FolderGit2, FolderOpen, RefreshCw, Settings2, SquareTerminal } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { useT } from "../../i18n";
import { shortPath } from "../../lib/format";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import IconButton from "../common/IconButton";
import { tip } from "../common/Tooltip";
import SettingsDialog from "../settings/SettingsDialog";
export default function TitleBar() {
  const t = useT();
  const { project, snapshot, changes, settingsOpen, terminalOpen } = useSlice((state) => ({
    project: state.activeProject,
    snapshot: state.snapshot,
    changes: state.changes,
    settingsOpen: state.settingsOpen,
    terminalOpen: state.terminalOpen && state.terminals.length > 0,
  }));

  const refresh = useAppStore((state) => state.refresh);
  const openChanges = useAppStore((state) => state.openChanges);
  const notify = useAppStore((state) => state.notify);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const toggleTerminalPanel = useAppStore((state) => state.toggleTerminalPanel);

  const reveal = async () => {
    if (!project) return;
    try {
      await revealItemInDir(project.path);
    } catch {
      notify("error", t("layout.revealFailed"));
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="drag-region flex h-11 shrink-0 items-center justify-between gap-4 border-b border-line/80 bg-sidebar/80 pl-[86px] pr-3 backdrop-blur-xl"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-accent text-white shadow-sm">
          <FolderGit2 size={12} strokeWidth={2.2} />
        </span>
        <span className="text-[12.5px] font-semibold tracking-tight text-ink">Git Kit</span>
        {project ? (
          <span className="min-w-0 truncate text-[11.5px] text-ink-faint">
            <span className="mx-1.5 text-line-strong">/</span>
            {shortPath(project.path)}
          </span>
        ) : null}
      </div>

      <div className="no-drag flex items-center gap-1">
        {snapshot?.isDirty ? (
          <button
            type="button"
            onClick={() => void openChanges()}
            {...tip(t("layout.dirtyHint"))}
            className="mr-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-warning transition-colors hover:bg-warning/10"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            {t("layout.uncommitted")}
            {changes?.entries.length ? (
              <span className="font-mono text-[10px]">{changes.entries.length}</span>
            ) : null}
          </button>
        ) : null}
        <IconButton
          label={t("layout.revealInFinder")}
          onClick={() => void reveal()}
          disabled={!project}
        >
          <FolderOpen size={14} />
        </IconButton>
        <IconButton
          label={t("layout.refresh")}
          shortcut="⌘R"
          onClick={() => void refresh()}
          disabled={!project}
        >
          <RefreshCw size={14} />
        </IconButton>
        <IconButton
          label={terminalOpen ? t("layout.collapseTerminal") : t("layout.openTerminal")}
          shortcut="⌘J"
          active={terminalOpen}
          onClick={toggleTerminalPanel}
          disabled={!project}
        >
          <SquareTerminal size={14} />
        </IconButton>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          aria-label={t("layout.settings")}
          aria-pressed={settingsOpen}
          onClick={() => setSettingsOpen(true)}
          {...tip(t("layout.settings"))}
          className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-35 ${
            settingsOpen
              ? "bg-accent-soft text-accent"
              : "text-ink-soft hover:bg-ink/8 hover:text-ink"
          }`}
        >
          <Settings2 size={14} />
          {t("layout.settings")}
        </button>
      </div>

      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </header>
  );
}