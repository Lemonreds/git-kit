import { Cloud, CloudOff, GitBranch, TriangleAlert } from "lucide-react";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import { tip } from "../common/Tooltip";

/**
 * Bottom bar of the middle column: branch + change count on the left, the
 * repository's remote on the right (click = open settings → remotes).
 */
export default function StatusBar() {
  const t = useT();
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
        {...tip(
          branch ? t("workspace.branchTip", { branch }) : t("workspace.detachedTip"),
        )}
        className="flex min-w-0 items-center gap-1.5"
      >
        {detached ? (
          <TriangleAlert size={11} className="shrink-0 text-warning" />
        ) : (
          <GitBranch size={11} className="shrink-0 text-ink-faint" />
        )}
        <span className={`truncate font-mono ${detached ? "text-warning" : "text-ink-soft"}`}>
          {branch ?? t("workspace.noBranch")}
        </span>
      </span>

      {dirtyCount > 0 ? (
        <span
          {...tip(t("workspace.dirtyTip"))}
          className="flex shrink-0 items-center gap-1 text-warning"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {dirtyCount}
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        {...tip(remoteUrl ? t("workspace.remoteTip", { url: remoteUrl }) : t("workspace.noRemoteTip"))}
        className={`ml-auto flex min-w-0 shrink items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-ink/5 ${
          remoteHost ? "text-ink-faint hover:text-accent" : "text-warning/90 hover:bg-warning/10"
        }`}
      >
        {remoteHost ? (
          <Cloud size={11} className="shrink-0" />
        ) : (
          <CloudOff size={11} className="shrink-0" />
        )}
        <span className="truncate font-mono">{remoteHost ?? t("workspace.noRemote")}</span>
      </button>
    </div>
  );
}