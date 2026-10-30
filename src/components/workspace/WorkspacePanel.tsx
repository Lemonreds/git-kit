import { AlertTriangle, FolderGit2, FolderSearch, Plus, Trash2 } from "lucide-react";

import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import BranchPanel from "../branches/BranchPanel";
import ChangesPanel from "../changes/ChangesPanel";
import CommitPanel from "../commits/CommitPanel";
import EmptyState from "../common/EmptyState";
import RepoStateBanner from "./RepoStateBanner";
import StatusBar from "./StatusBar";

export default function WorkspacePanel() {
  const { project, pane } = useSlice((state) => ({
    project: state.activeProject,
    pane: state.pane,
  }));

  const addProject = useAppStore((state) => state.addProject);
  const relinkProject = useAppStore((state) => state.relinkProject);
  const removeProject = useAppStore((state) => state.removeProject);

  if (!project) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
        <EmptyState
          icon={FolderGit2}
          title="还没有项目"
          description="从左侧添加一个本地 Git 仓库，即可开始浏览。"
        >
          <button
            type="button"
            onClick={() => void addProject()}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus size={13} />
            添加项目
          </button>
        </EmptyState>
      </section>
    );
  }

  if (project.status !== "ok") {
    const title =
      project.status === "denied"
        ? "没有访问该文件夹的权限"
        : project.status === "notrepo"
          ? "该文件夹不是 Git 仓库"
          : "找不到该文件夹";

    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
        <EmptyState
          icon={AlertTriangle}
          title={title}
          description={
            project.statusHint ??
            "文件夹可能已被移动或删除。重新选择位置后，项目记录与设置会保留。"
          }
        >
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void relinkProject(project.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <FolderSearch size={13} />
              重新选择文件夹
            </button>
            <button
              type="button"
              onClick={() => void removeProject(project.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <Trash2 size={13} />
              移除项目
            </button>
          </div>
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <RepoStateBanner />
      <div className="min-h-0 flex-1">
        {pane === "changes" ? <ChangesPanel /> : pane === "commits" ? <CommitPanel /> : <BranchPanel />}
      </div>
      <StatusBar />
    </section>
  );
}