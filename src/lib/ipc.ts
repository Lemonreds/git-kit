import { Channel, invoke } from "@tauri-apps/api/core";

import { t } from "../i18n";

import type {
  AppError,
  AppSettings,
  BranchSummary,
  BranchTemplate,
  CheckoutResult,
  CherryPickResult,
  CommitDetail,
  CommitFiles,
  CommitPage,
  CommitResult,
  ComparePreview,
  CreateBranchResult,
  HeadCommitPreview,
  DeleteBranchesResult,
  DeleteTagResult,
  FetchAllResult,
  FileDiff,
  Project,
  ProjectList,
  MergePreview,
  MergeResult,
  PullPreview,
  PullResult,
  PushPreview,
  PushResult,
  RebasePreview,
  RebaseResult,
  ReflogEntry,
  RemoteBranchPage,
  RemoteInfo,
  RemoveRemoteResult,
  RepoIdentity,
  RepoOperationState,
  RepoSnapshot,
  ResetResult,
  SquashPreview,
  SquashResult,
  StashList,
  SyncResult,
  TagInfo,
  TerminalSessionInfo,
  WorktreeStatus,
} from "./types";

export class IpcError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IpcError";
    this.code = code;
  }
}

function normalizeError(raw: unknown): IpcError {
  if (raw && typeof raw === "object") {
    const candidate = raw as Partial<AppError>;
    if (typeof candidate.message === "string") {
      return new IpcError(candidate.code ?? "unknown", candidate.message);
    }
  }
  if (typeof raw === "string") {
    return new IpcError("unknown", raw);
  }
  return new IpcError("unknown", t("store.unknownError"));
}

/**
 * Single choke point for IPC. Every backend error becomes an `IpcError` with a
 * code, so views can distinguish "permission denied" from "not a repo".
 */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (raw) {
    throw normalizeError(raw);
  }
}

/** One message of the terminal channel: output bytes or an exit control frame. */
type TerminalMessage = ArrayBuffer | { kind: "exit"; code: number | null };

/** How the terminal view receives its stream. */
export interface TerminalStream {
  onData: (bytes: Uint8Array) => void;
  onExit: (code: number | null) => void;
}

export const api = {
  listProjects: () => call<ProjectList>("list_projects"),
  addProject: (path: string) => call<Project>("add_project", { path }),
  relinkProject: (id: string, path: string) => call<Project>("relink_project", { id, path }),
  removeProject: (id: string) => call<void>("remove_project", { id }),
  setActiveProject: (id: string | null) => call<void>("set_active_project", { id }),
  setProjectPinned: (id: string, pinned: boolean) =>
    call<Project>("set_project_pinned", { id, pinned }),

  repoSnapshot: (path: string) => call<RepoSnapshot>("get_repo_snapshot", { path }),
  listBranches: (repoPath: string, includeRemote = false) =>
    call<BranchSummary[]>("list_branches", { repoPath, includeRemote }),
  listRemoteBranches: (repoPath: string, limit = 10, offset = 0) =>
    call<RemoteBranchPage>("list_remote_branches", { repoPath, limit, offset }),
  listCommits: (repoPath: string, rev: string, offset = 0, limit = 50) =>
    call<CommitPage>("list_commits", { repoPath, rev, offset, limit }),
  getCommit: (repoPath: string, sha: string) => call<CommitDetail>("get_commit", { repoPath, sha }),
  getCommitFiles: (repoPath: string, sha: string) =>
    call<CommitFiles>("get_commit_files", { repoPath, sha }),
  getFileDiff: (repoPath: string, sha: string, path: string, oldPath?: string | null) =>
    call<FileDiff>("get_file_diff", {
      repoPath,
      sha,
      path,
      oldPath: oldPath ?? null,
      contextLines: 3,
    }),

  worktreeStatus: (repoPath: string) => call<WorktreeStatus>("get_worktree_status", { repoPath }),
  stageFile: (repoPath: string, path: string) => call<WorktreeStatus>("stage_file", { repoPath, path }),
  unstageFile: (repoPath: string, path: string) =>
    call<WorktreeStatus>("unstage_file", { repoPath, path }),
  discardFile: (repoPath: string, path: string) =>
    call<WorktreeStatus>("discard_file", { repoPath, path }),
  stageAll: (repoPath: string) => call<WorktreeStatus>("stage_all", { repoPath }),
  unstageAll: (repoPath: string) => call<WorktreeStatus>("unstage_all", { repoPath }),
  discardAll: (repoPath: string) => call<WorktreeStatus>("discard_all", { repoPath }),
  worktreeDiff: (repoPath: string, path: string, staged: boolean) =>
    call<FileDiff>("get_worktree_diff", { repoPath, path, staged, contextLines: 3 }),
  commitStaged: (repoPath: string, message: string) =>
    call<CommitResult>("commit_staged", { repoPath, message }),

  squashPreview: (repoPath: string, branch: string) =>
    call<SquashPreview>("squash_preview", { repoPath, branch }),
  squashCommits: (repoPath: string, branch: string, count: number, message: string) =>
    call<SquashResult>("squash_commits", { repoPath, branch, count, message }),
  cherryPick: (repoPath: string, sourceBranch: string, targetBranch: string, shas: string[]) =>
    call<CherryPickResult>("cherry_pick", { repoPath, sourceBranch, targetBranch, shas }),
  createBranch: (repoPath: string, name: string, baseRef: string, checkout = true) =>
    call<CreateBranchResult>("create_branch", { repoPath, name, baseRef, checkout }),
  checkoutBranch: (repoPath: string, branch: string) =>
    call<CheckoutResult>("checkout_branch", { repoPath, branch }),
  deleteLocalBranches: (repoPath: string, names: string[], forceUnmerged = false, deleteRemote = false) =>
    call<DeleteBranchesResult>("delete_local_branches", {
      repoPath,
      names,
      forceUnmerged,
      deleteRemote,
    }),
  pushPreview: (repoPath: string, branch: string) =>
    call<PushPreview>("push_preview", { repoPath, branch }),
  pullPreview: (repoPath: string, branch: string) =>
    call<PullPreview>("pull_preview", { repoPath, branch }),
  pullBranch: (repoPath: string, branch: string, allowMerge: boolean, switchFirst = false) =>
    call<PullResult>("pull_branch", { repoPath, branch, allowMerge, switchFirst }),
  rebasePreview: (repoPath: string, branch: string, baseRef: string) =>
    call<RebasePreview>("rebase_preview", { repoPath, branch, baseRef }),
  rebaseBranch: (repoPath: string, branch: string, baseRef: string) =>
    call<RebaseResult>("rebase_branch", { repoPath, branch, baseRef }),
  pushBranch: (repoPath: string, branch: string, force: boolean) =>
    call<PushResult>("push_branch", { repoPath, branch, force }),
  syncBranch: (repoPath: string, branch: string) =>
    call<SyncResult>("sync_branch", { repoPath, branch }),
  fetchAll: (repoPath: string) => call<FetchAllResult>("fetch_all", { repoPath }),

  getSettings: () => call<AppSettings>("get_settings"),
  saveBranchTemplates: (templates: BranchTemplate[], defaultTemplateId: string | null) =>
    call<AppSettings>("save_branch_templates", { templates, defaultTemplateId }),

  listRemotes: (repoPath: string) => call<RemoteInfo[]>("list_remotes", { repoPath }),
  addRemote: (repoPath: string, name: string, url: string) =>
    call<RemoteInfo>("add_remote", { repoPath, name, url }),
  removeRemote: (repoPath: string, name: string) =>
    call<RemoveRemoteResult>("remove_remote", { repoPath, name }),
  getRepoIdentity: (repoPath: string) =>
    call<RepoIdentity>("get_repo_identity", { repoPath }),
  setRepoIdentity: (repoPath: string, name: string, email: string) =>
    call<RepoIdentity>("set_repo_identity", { repoPath, name, email }),

  // --- P0 / P1 / P2 workflow ---
  getRepoState: (repoPath: string) => call<RepoOperationState>("get_repo_state", { repoPath }),
  repoOperation: (repoPath: string, action: "continue" | "skip" | "abort") =>
    call<RepoOperationState>("repo_operation_action", { repoPath, action }),

  stashList: (repoPath: string) => call<StashList>("stash_list", { repoPath }),
  stashPush: (repoPath: string, message: string, includeUntracked = false) =>
    call<StashList>("stash_push", { repoPath, message, includeUntracked }),
  stashPop: (repoPath: string, index: number) => call<StashList>("stash_pop", { repoPath, index }),
  stashDrop: (repoPath: string, index: number) =>
    call<StashList>("stash_drop", { repoPath, index }),

  headCommitPreview: (repoPath: string) =>
    call<HeadCommitPreview>("head_commit_preview", { repoPath }),
  amendCommit: (repoPath: string, message: string) =>
    call<CommitResult>("amend_commit", { repoPath, message }),
  ignorePath: (repoPath: string, path: string, isDir = false) =>
    call<void>("ignore_path", { repoPath, path, isDir }),

  mergePreview: (repoPath: string, source: string) =>
    call<MergePreview>("merge_preview", { repoPath, source }),
  mergeBranch: (repoPath: string, source: string, noFf = false) =>
    call<MergeResult>("merge_branch", { repoPath, source, noFf }),
  revertCommit: (repoPath: string, sha: string) =>
    call<CommitResult>("revert_commit", { repoPath, sha }),

  listTags: (repoPath: string) => call<TagInfo[]>("list_tags", { repoPath }),
  createTag: (repoPath: string, name: string, target: string, message = "") =>
    call<TagInfo[]>("create_tag", { repoPath, name, target, message }),
  deleteTag: (repoPath: string, name: string, deleteRemote = false) =>
    call<DeleteTagResult>("delete_tag", { repoPath, name, deleteRemote }),
  pushTag: (repoPath: string, name: string) =>
    call<string>("push_tag", { repoPath, name }),

  reflogEntries: (repoPath: string, limit = 20) =>
    call<ReflogEntry[]>("reflog_entries", { repoPath, limit }),
  resetTo: (repoPath: string, sha: string, hard = false) =>
    call<ResetResult>("reset_to", { repoPath, sha, hard }),

  compareRefs: (repoPath: string, base: string, head: string) =>
    call<ComparePreview>("compare_refs", { repoPath, base, head }),
  compareFileDiff: (
    repoPath: string,
    base: string,
    head: string,
    path: string,
    oldPath?: string | null,
  ) =>
    call<FileDiff>("compare_file_diff", {
      repoPath,
      base,
      head,
      path,
      oldPath: oldPath ?? null,
      contextLines: 3,
    }),

  getFileContent: (repoPath: string, sha: string, path: string) =>
    call<string>("get_file_content", { repoPath, sha, path }),

  // --- terminal ---
  terminalOpen: (
    path: string,
    cols: number,
    rows: number,
    stream: TerminalStream,
    shell?: string | null,
  ) => {
    // Raw bytes for the terminal output, a tagged object for the control frames:
    // the channel delivers `ArrayBuffer` for the former, which is ~4x cheaper
    // than the JSON number array a `Vec<u8>` would serialise into.
    const channel = new Channel<TerminalMessage>();
    channel.onmessage = (message) => {
      if (message instanceof ArrayBuffer) {
        stream.onData(new Uint8Array(message));
        return;
      }
      if (message && typeof message === "object" && message.kind === "exit") {
        stream.onExit(message.code ?? null);
      }
    };
    return call<TerminalSessionInfo>("terminal_open", {
      path,
      cols,
      rows,
      shell: shell ?? null,
      onEvent: channel,
    });
  },
  terminalWrite: (id: string, data: string) =>
    call<void>("terminal_write", { id, data }),
  terminalResize: (id: string, cols: number, rows: number) =>
    call<void>("terminal_resize", { id, cols, rows }),
  terminalPause: (id: string) => call<void>("terminal_pause", { id }),
  terminalResume: (id: string) => call<void>("terminal_resume", { id }),
  terminalClose: (id: string) => call<void>("terminal_close", { id }),
};
