/**
 * Which repository this window is pinned to.
 *
 * The main window owns the project list. Every extra window is created with
 * `?project=<id>` (see the `open_project_window` command) and keeps that one
 * repository active; the project column is hidden there. Reading the parameter
 * once at module scope is enough — a window never changes its target.
 */
const PROJECT_PARAM = "project";

function readProjectId(): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get(PROJECT_PARAM);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export const windowProjectId: string | null = readProjectId();

/** True when this window shows a single repository instead of the project list. */
export const isProjectWindow: boolean = windowProjectId !== null;