import { t } from "../i18n";
import type { MessageKey } from "../i18n";
import type { Project } from "./types";

export type ProjectSort = "recent" | "name" | "added";

const PROJECT_SORT_LABEL_KEYS: Record<ProjectSort, MessageKey> = {
  recent: "lib.sort.recent",
  name: "lib.sort.name",
  added: "lib.sort.added",
};

export function projectSortLabel(sort: ProjectSort): string {
  return t(PROJECT_SORT_LABEL_KEYS[sort]);
}

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