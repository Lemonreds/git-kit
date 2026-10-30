import { Cloud, CloudOff, GitBranch, TriangleAlert } from "lucide-react";

import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import { tip } from "../common/Tooltip";

/**
 * Bottom bar of the middle column: branch + change count on the left, the
 * repository's remote on the right (click = open 设置 → 远程仓库).
 */
export default function StatusBar() {
  const { project, snapshot, changes } = useSlice((state) => ({
    project: state.activeProject,
    snapshot: state.snapshot,
    changes: state.changes,
  }));
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  if (!project) return null;

  const branch = snapshot?.headBranch ?? project.headBranch;
  const detached = branch?.startsWith("detached@") ?? false;
  const dirtyCount = changes?.entries.length ?? 0;
  const remoteHost = snapshot?.remoteHost ?? project.remoteHost ?? null;
  const remoteUrl = snapshot?.url ?? project.url ?? null;

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-line/70 px-3 text-[10.5px]">
      <span
        {...tip(branch ? `当前分支：${branch}` : "当前为游离 HEAD 或无分支")}
        className="flex min-w-0 items-center gap-1.5"
      >
        {detached ? (
          <TriangleAlert size={11} className="shrink-0 text-warning" />
        ) : (
          <GitBranch size={11} className="shrink-0 text-ink-faint" />
        )}
        <span
          className={`truncate font-mono ${detached ? "text-warning" : "text-ink-soft"}`}
        >
          {branch ?? "无分支"}
        </span>
      </span>

      {dirtyCount > 0 ? (
        <span
          {...tip("当前分支有未提交的改动")}
          className="flex shrink-0 items-center gap-1 text-warning"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {dirtyCount}
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        {...tip(
          remoteUrl
            ? `远程地址：${remoteUrl}`
            : "未配置远程地址，点击在设置里添加",
        )}
        className={`ml-auto flex min-w-0 shrink items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-ink/5 ${
          remoteHost ? "text-ink-faint hover:text-accent" : "text-warning/90 hover:bg-warning/10"
        }`}
      >
        {remoteHost ? (
          <Cloud size={11} className="shrink-0" />
        ) : (
          <CloudOff size={11} className="shrink-0" />
        )}
        <span className="truncate font-mono">{remoteHost ?? "未配置远程地址"}</span>
      </button>
    </div>
  );
}