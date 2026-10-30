import { FolderGit2, FolderOpen, RefreshCw, Settings2 } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import { shortPath } from "../../lib/format";
import IconButton from "../common/IconButton";
import { tip } from "../common/Tooltip";
import SettingsDialog from "../settings/SettingsDialog";
export default function TitleBar() {
  const { project, snapshot, changes, settingsOpen } = useSlice((state) => ({
    project: state.activeProject,
    snapshot: state.snapshot,
    changes: state.changes,
    settingsOpen: state.settingsOpen,
  }));

  const refresh = useAppStore((state) => state.refresh);
  const openChanges = useAppStore((state) => state.openChanges);
  const notify = useAppStore((state) => state.notify);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  const reveal = async () => {
    if (!project) return;
    try {
      await revealItemInDir(project.path);
    } catch {
      notify("error", "无法在 Finder 中打开该文件夹");
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
            {...tip("工作区存在未提交的改动，点击查看")}
            className="mr-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-warning transition-colors hover:bg-warning/10"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            未提交
            {changes?.entries.length ? (
              <span className="font-mono text-[10px]">{changes.entries.length}</span>
            ) : null}
          </button>
        ) : null}
        <IconButton label="在 Finder 中显示" onClick={() => void reveal()} disabled={!project}>
          <FolderOpen size={14} />
        </IconButton>
        <IconButton label="刷新" shortcut="⌘R" onClick={() => void refresh()} disabled={!project}>
          <RefreshCw size={14} />
        </IconButton>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          aria-label="设置"
          aria-pressed={settingsOpen}
          disabled={!project}
          onClick={() => setSettingsOpen(true)}
          {...tip("设置")}
          className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-35 ${
            settingsOpen
              ? "bg-accent-soft text-accent"
              : "text-ink-soft hover:bg-ink/8 hover:text-ink"
          }`}
        >
          <Settings2 size={14} />
          设置
        </button>
      </div>

      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </header>
  );
}