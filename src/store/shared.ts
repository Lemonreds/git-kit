import { t } from "../i18n";
import { clearInlineBlameCache } from "../lib/inlineBlame";
import { translateError } from "../i18n/errors";
import type {
  BlameWindow,
  CommitFiles,
  CommitPage,
  FileChange,
  FileDiff,
  FileHistoryPage,
  Project,
  ProjectList,
} from "../lib/types";
import { LRUCache } from "../lib/lruCache";

import type { PaneMode, ToastKind } from "./types";

export const PAGE_SIZE = 50;
/** Remote branches loaded per page; the load-more button adds this many. */
export const REMOTE_PAGE = 10;
/**
 * Tags shown at first and added per "load more". Release-heavy repositories
 * carry hundreds of tags; the whole list is already in memory, so a page is
 * just how much of it the list is allowed to render at once.
 */
export const TAG_PAGE = 20;

/**
 * Small per-session caches. Re-opening the same branch / commit / file must not
 * touch the repository again — this keeps disk access (and macOS consent
 * surface) to the minimum the user actually asked for.
 *
 * Both an entry cap and a weight budget are enforced: a cached patch can be
 * 20 KB or 1.5 MB, so counting entries alone would let the cache grow to tens of
 * megabytes inside a long session.
 */
export const commitsCache = new LRUCache<string, CommitPage>(30, {
  maxWeight: 2_000_000, // ~10k commit rows
  weigh: (page) => page.commits.length * 200 + 256,
});
export const filesCache = new LRUCache<string, CommitFiles>(30, {
  maxWeight: 1_500_000, // ~12k file rows
  weigh: (entry) => entry.files.length * 120 + 256,
});
export const diffCache = new LRUCache<string, FileDiff>(20, {
  maxWeight: 12_000_000, // UTF-16 bytes of the patches, i.e. ~6 MB of text
  weigh: (diff) => diff.patch.length * 2 + 512,
});

/**
 * File history / blame caches. Both are bound by weight, not just entries: a
 * blame window carries one row per hunk, and a history page one row per commit,
 * so an entry cap alone would still let a few huge files dominate the session.
 */
export const historyCache = new LRUCache<string, FileHistoryPage>(20, {
  maxWeight: 1_500_000,
  weigh: (page) => page.entries.length * 160 + 256,
});
export const blameCache = new LRUCache<string, BlameWindow>(60, {
  maxWeight: 4_000_000,
  weigh: (window) => window.hunks.length * 96 + window.lines.length * 64 + 512,
});

/**
 * Epoch counters shared by the slices: `project` guards repo-wide loads (a late
 * response for the previous project must not land), `detail` guards commit /
 * diff loads inside one project.
 */
export const token = { project: 0, detail: 0 };

export function invalidateCaches() {
  commitsCache.clear();
  filesCache.clear();
  diffCache.clear();
  historyCache.clear();
  blameCache.clear();
  // Inline annotations point at commits; after a commit / checkout / rebase they
  // describe a file state that no longer exists.
  clearInlineBlameCache();
}

/**
 * Drop the bulky per-file caches but keep the cheap commit lists. Used when the
 * window is hidden and when another project is opened: the data is rebuilt on
 * demand and re-reading a file is cheap compared to holding it in RAM forever.
 */
export function releaseTransientCaches() {
  filesCache.clear();
  diffCache.clear();
  historyCache.clear();
  blameCache.clear();
}

/**
 * A thrown `IpcError` carries a stable `code`. Checked structurally so `store/`
 * never imports `lib/ipc.ts` (which would create an import cycle).
 */
function codedError(value: unknown): { code: string; message: string } | null {
  if (typeof value !== "object" || value === null || !("code" in value)) return null;
  const candidate = value as { code?: unknown; message?: unknown };
  if (typeof candidate.code !== "string") return null;
  return {
    code: candidate.code,
    message:
      typeof candidate.message === "string" ? candidate.message : t("store.unknownError"),
  };
}

export function errorMessage(error: unknown): string {
  const coded = codedError(error);
  if (coded) return translateError(coded.code, coded.message);
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return t("store.unknownError");
}

export function cacheKey(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("::");
}

export function upsertProject(projects: Project[], next: Project): Project[] {
  const index = projects.findIndex((project) => project.id === next.id);
  if (index === -1) return [...projects, next];
  const copy = projects.slice();
  copy[index] = next;
  return copy;
}

export function pickActive(list: ProjectList): Project | null {
  const persisted = list.lastActiveId
    ? list.projects.find((project) => project.id === list.lastActiveId)
    : undefined;
  return persisted ?? list.projects.find((project) => project.status === "ok") ?? list.projects[0] ?? null;
}

/** Reset every commit/diff field and invalidate in-flight detail loads. */
export function clearDetail() {
  token.detail += 1;
  return {
    pane: "branches" as PaneMode,
    selectedBranch: null,
    selectedTag: null,
    commits: [] as CommitPage["commits"],
    commitsLoading: false,
    commitsHasMore: false,
    commitSearchOpen: false,
    selectedCommitSha: null,
    commitFiles: [] as FileChange[],
    filesLoading: false,
    selectedFilePath: null,
    diff: null,
    diffLoading: false,
    worktreeTarget: null,
    stashPreview: null,
    changesLoading: false,
    // The resolver and the file-history view belong to the repository that was
    // open when they started, so leaving that context closes them too.
    conflictPath: null,
    conflictDetail: null,
    conflictParsed: null,
    conflictDrafts: {},
    conflictLoading: false,
    fileView: null,
  };
}

type FeedbackSource = {
  notify: (kind: ToastKind, message: string) => void;
  showAlert: (title: string, message: string) => void;
};

/**
 * Toast / alert helpers bound to a store's `get`. Slices get their own copy so
 * they never import each other: every write still goes through the store.
 */
export function feedback(get: () => FeedbackSource) {
  const notify = (kind: ToastKind, message: string) => get().notify(kind, message);

  /** Errors with long git output are shown as a dialog instead of a toast. */
  const fail = (title: string, error: unknown) => {
    const message = errorMessage(error);
    if (message.length > 160 || message.includes("\n")) {
      get().showAlert(title, message);
      return;
    }
    notify("error", message);
  };

  return { notify, fail };
}