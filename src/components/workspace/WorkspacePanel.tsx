import { AlertTriangle, FolderGit2, FolderSearch, Loader2, Plus, Trash2 } from "lucide-react";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import BranchPanel from "../branches/BranchPanel";
import ChangesPanel from "../changes/ChangesPanel";
import CommitPanel from "../commits/CommitPanel";
import EmptyState from "../common/EmptyState";
import StashPanel from "../stash/StashPanel";
import TagsPanel from "../tags/TagsPanel";
import WorkflowPanel from "../workflow/WorkflowPanel";
import RepoStateBanner from "./RepoStateBanner";
import StatusBar from "./StatusBar";

export default function WorkspacePanel() {
  const t = useT();
  const { project, pane, adding, relinkingId } = useSlice((state) => ({
    project: state.activeProject,
    pane: state.pane,
    adding: state.addingProject,
    relinkingId: state.relinkingId,
  }));

  const addProject = useAppStore((state) => state.addProject);
  const relinkProject = useAppStore((state) => state.relinkProject);
  const removeProject = useAppStore((state) => state.removeProject);

  if (!project) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
        <EmptyState
          icon={FolderGit2}
          title={t("workspace.emptyTitle")}
          description={t("workspace.emptyDescription")}
        >
          <button
            type="button"
            disabled={adding}
            aria-busy={adding}
            onClick={() => void addProject()}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
          >
            {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {t("workspace.addProject")}
          </button>
        </EmptyState>
      </section>
    );
  }

  if (project.status !== "ok") {
    const title =
      project.status === "denied"
        ? t("workspace.deniedTitle")
        : project.status === "notrepo"
          ? t("workspace.notRepoTitle")
          : t("workspace.missingTitle");

    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
        <EmptyState
          icon={AlertTriangle}
          title={title}
          description={project.statusHint ?? t("workspace.missingHint")}
        >
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              disabled={relinkingId === project.id}
              aria-busy={relinkingId === project.id}
              onClick={() => void relinkProject(project.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
            >
              {relinkingId === project.id ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <FolderSearch size={13} />
              )}
              {t("workspace.relink")}
            </button>
            <button
              type="button"
              onClick={() => void removeProject(project.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <Trash2 size={13} />
              {t("workspace.remove")}
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
        {pane === "changes" ? (
          <ChangesPanel />
        ) : pane === "commits" ? (
          <CommitPanel />
        ) : pane === "tags" ? (
          <TagsPanel />
        ) : pane === "stash" ? (
          <StashPanel />
        ) : pane === "workflows" ? (
          <WorkflowPanel />
        ) : (
          <BranchPanel />
        )}
      </div>
      <StatusBar />
    </section>
  );
}