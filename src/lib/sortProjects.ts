import type { Project } from "./types";

export type ProjectSort = "recent" | "name" | "added";

export const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  recent: "最近打开",
  name: "名称",
  added: "添加时间",
};

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

function compareProjects(a: Project, b: Project, sort: ProjectSort): number {
  if (sort === "name") return collator.compare(a.name, b.name);
  if (sort === "added") return b.addedAt - a.addedAt;
  return b.lastOpenedAt - a.lastOpenedAt;
}

export interface ProjectGroups {
  pinned: Project[];
  rest: Project[];
}

/**
 * Pinned projects always come first (newest pin on top) and ignore the selected
 * sort; everything else follows the sort order.
 */
export function groupProjects(projects: Project[], sort: ProjectSort): ProjectGroups {
  const pinned = projects
    .filter((project) => project.pinned)
    .sort((a, b) => (b.pinnedAt ?? b.lastOpenedAt) - (a.pinnedAt ?? a.lastOpenedAt) || collator.compare(a.name, b.name));
  const rest = projects
    .filter((project) => !project.pinned)
    .sort((a, b) => compareProjects(a, b, sort));
  return { pinned, rest };
}