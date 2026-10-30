import { useMemo, useState } from "react";
import { ArrowUpDown, Check, FolderGit2, Plus } from "lucide-react";

import { PROJECT_SORT_LABELS, groupProjects } from "../../lib/sortProjects";
import type { ProjectSort } from "../../lib/sortProjects";
import type { Project } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import ConfirmDialog from "../common/ConfirmDialog";
import IconButton from "../common/IconButton";
import ProjectRow from "./ProjectRow";
import SidebarFooter from "./SidebarFooter";

const SORT_OPTIONS: ProjectSort[] = ["recent", "name", "added"];

export default function ProjectSidebar() {
  const { projects, projectSort, activeId } = useSlice((state) => ({
    projects: state.projects,
    projectSort: state.projectSort,
    activeId: state.activeProject?.id ?? null,
  }));

  const setProjectSort = useAppStore((state) => state.setProjectSort);
  const addProject = useAppStore((state) => state.addProject);
  const selectProject = useAppStore((state) => state.selectProject);
  const removeProject = useAppStore((state) => state.removeProject);
  const relinkProject = useAppStore((state) => state.relinkProject);
  const pinProject = useAppStore((state) => state.pinProject);

  const [pendingRemoval, setPendingRemoval] = useState<Project | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const { pinned, rest } = useMemo(() => groupProjects(projects, projectSort), [projects, projectSort]);

  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    void removeProject(pendingRemoval.id);
    setPendingRemoval(null);
  };

  const renderRow = (project: Project) => (
    <ProjectRow
      key={project.id}
      project={project}
      active={project.id === activeId}
      onSelect={() => void selectProject(project.id)}
      onRemove={() => setPendingRemoval(project)}
      onRelink={() => void relinkProject(project.id)}
      onTogglePin={() => void pinProject(project.id, !project.pinned)}
    />
  );

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-line/70 bg-sidebar">
      <div
        data-tauri-drag-region
        className="drag-region relative flex h-11 shrink-0 items-center justify-between border-b border-line/50 px-3"
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-faint">
          项目
        </span>
        <div className="no-drag flex items-center gap-1">
          {projects.length > 0 ? (
            <span className="rounded-full bg-ink/6 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
              {projects.length}
            </span>
          ) : null}
          <IconButton
            label="排序方式"
            shortcut={PROJECT_SORT_LABELS[projectSort]}
            active={sortOpen}
            onClick={() => setSortOpen((open) => !open)}
          >
            <ArrowUpDown size={14} />
          </IconButton>
          <IconButton label="添加项目" shortcut="⌘O" onClick={() => void addProject()}>
            <Plus size={14} strokeWidth={2.2} />
          </IconButton>
        </div>

        {sortOpen ? (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setSortOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
            />
            <div className="no-drag animate-pop absolute right-2 top-[38px] z-40 w-40 overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-float">
              <p className="px-1.5 pb-1 pt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                排序（置顶固定在最上）
              </p>
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setProjectSort(option);
                    setSortOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[11.5px] transition-colors ${
                    projectSort === option
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  <span className="flex-1">{PROJECT_SORT_LABELS[option]}</span>
                  {projectSort === option ? <Check size={11} /> : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {projects.length === 0 ? (
          <button
            type="button"
            onClick={() => void addProject()}
            className="group mt-1 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong/70 bg-panel/40 px-4 py-6 text-center transition-colors hover:border-accent/50 hover:bg-accent-soft/40"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-panel text-ink-faint transition-colors group-hover:text-accent">
              <FolderGit2 size={16} />
            </span>
            <span className="text-[12px] font-medium text-ink">添加本地仓库</span>
            <span className="text-[10.5px] leading-relaxed text-ink-faint">
              选择一个已有的 Git 仓库文件夹
            </span>
          </button>
        ) : (
          <div className="space-y-0.5">
            {pinned.map(renderRow)}

            {pinned.length > 0 && rest.length > 0 ? (
              <div className="flex items-center gap-2 px-2 pb-1 pt-2.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  其他项目
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
            ) : null}

            {rest.map(renderRow)}

            {pinned.length > 0 && rest.length === 0 ? (
              <p className="px-2 pt-2 text-[10px] leading-relaxed text-ink-faint">
                全部项目都已置顶
              </p>
            ) : null}
          </div>
        )}
      </div>

      <SidebarFooter />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="移除项目"
        description={`从列表中移除「${pendingRemoval?.name ?? ""}」，磁盘上的仓库文件不会被删除。`}
        confirmLabel="移除"
        tone="danger"
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </aside>
  );
}