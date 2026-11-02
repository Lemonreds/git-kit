export type ProjectStatus = "ok" | "missing" | "denied" | "notrepo";

export interface Project {
  id: string;
  path: string;
  name: string;
  url: string | null;
  remoteHost: string | null;
  headBranch: string | null;
  status: ProjectStatus;
  statusHint?: string;
  addedAt: number;
  lastOpenedAt: number;
  pinned: boolean;
  pinnedAt: number | null;
}

export interface ProjectList {
  projects: Project[];
  lastActiveId: string | null;
}

export interface RepoSnapshot {
  path: string;
  name: string;
  url: string | null;
  remoteHost: string | null;
  headBranch: string | null;
  isDirty: boolean;
  isBare: boolean;
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  summary: string;
  authorName: string;
  authorEmail: string;
  committedAt: number;
}

export interface CommitPage {
  commits: CommitSummary[];
  hasMore: boolean;
}

export interface CommitDetail {
  sha: string;
  shortSha: string;
  summary: string;
  message: string;
  authorName: string;
  authorEmail: string;
  committedAt: number;
  parents: string[];
  isMerge: boolean;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface BranchSummary {
  refName: string;
  name: string;
  shortName: string;
  isHead: boolean;
  isRemote: boolean;
  hasLocal: boolean;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  lastCommit: CommitSummary | null;
}

export interface RemoteBranchPage {
  branches: BranchSummary[];
  total: number;
  limit: number;
  /** How many newest branches were skipped (paging support). */
  offset: number;
}

export type FileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "typechange"
  | "untracked"
  | "conflicted"
  | "unknown";

export interface FileChange {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

export interface CommitFiles {
  sha: string;
  shortSha: string;
  isMerge: boolean;
  files: FileChange[];
}

export interface WorktreeEntry {
  path: string;
  oldPath: string | null;
  /** index vs HEAD */
  staged: FileStatus | null;
  /** worktree vs index (untracked files land here) */
  unstaged: FileStatus | null;
  conflicted: boolean;
}

export interface WorktreeStatus {
  headBranch: string | null;
  entries: WorktreeEntry[];
  stagedCount: number;
  unstagedCount: number;
  conflictedCount: number;
}

export interface SquashPreview {
  branch: string;
  baseBranch: string | null;
  baseSha: string | null;
  count: number;
  totalCommits: number;
  oldestSha: string | null;
  oldestMessage: string | null;
  commits: CommitSummary[];
}

export interface SquashResult {
  sha: string;
  shortSha: string;
  message: string;
  squashed: number;
}

export interface CommitResult {
  sha: string;
  shortSha: string;
  message: string;
  branch: string | null;
  filesChanged: number;
  /** An amend after the commit was pushed needs a force push. */
  needsForcePush: boolean;
}

export interface ResetResult {
  sha: string;
  shortSha: string;
  /** `mixed` | `hard` */
  mode: string;
}

export interface RepoOperationState {
  /** `none` | `merge` | `rebase` | `cherry-pick` | `revert` */
  kind: string;
  conflicts: string[];
  canSkip: boolean;
  detail: string | null;
}

export interface StashEntry {
  selector: string;
  index: number;
  message: string;
}

export interface StashList {
  entries: StashEntry[];
}

export interface HeadCommitPreview {
  sha: string;
  shortSha: string;
  message: string;
  filesChanged: number;
  pushed: boolean;
}

export interface MergePreview {
  source: string;
  sourceSha: string;
  commits: CommitSummary[];
  count: number;
  canFastForward: boolean;
  dirty: boolean;
}

export interface MergeResult {
  source: string;
  /** `fast-forward` | `merge` | `up-to-date` */
  strategy: string;
  commits: number;
  shortSha: string;
}

/** Result of deleting a tag, optionally including the origin copy. */
export interface DeleteTagResult {
  tags: TagInfo[];
  /** True when the tag was also removed from origin. */
  remoteDeleted: boolean;
  /** Why the remote tag was kept, when deleteRemote was requested. */
  remoteFailure: string | null;
}

export interface TagInfo {
  name: string;
  sha: string;
  shortSha: string;
  annotated: boolean;
  message: string | null;
  createdAt: number | null;
  target: string | null;
}

export interface ReflogEntry {
  index: number;
  sha: string;
  shortSha: string;
  action: string;
  message: string;
  when: number;
}

export interface ComparePreview {
  base: string;
  head: string;
  commits: CommitSummary[];
  commitCount: number;
  files: FileChange[];
  additions: number;
  deletions: number;
}

export interface CherryPickResult {
  targetBranch: string;
  picked: string[];
}

export interface PushResult {
  branch: string;
  remote: string;
  forced: boolean;
  output: string;
}

export interface SyncResult {
  branch: string;
  remote: string;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  output: string;
}

/** `git fetch --all --prune`: every remote in one shot. */
export interface FetchAllResult {
  remotes: string[];
  /** Raw fetch output; empty means every ref was already up to date. */
  output: string;
}

export interface PushPreview {
  branch: string;
  remote: string;
  upstream: string | null;
  remoteExists: boolean;
  localSha: string | null;
  remoteSha: string | null;
  ahead: number;
  behind: number;
  pushCommits: CommitSummary[];
  remoteOnlyCommits: CommitSummary[];
  remoteOnlyTotal: number;
  requiresForce: boolean;
}

export interface CreateBranchResult {
  branch: string;
  refName: string;
  base: string;
  baseSha: string;
  checkedOut: boolean;
  upstream: string | null;
}

export interface CheckoutResult {
  branch: string;
  shortSha: string;
  switched: boolean;
}

export interface PullPreview {
  branch: string;
  remote: string;
  upstream: string | null;
  remoteExists: boolean;
  localSha: string | null;
  remoteSha: string | null;
  ahead: number;
  behind: number;
  incomingCommits: CommitSummary[];
  incomingTotal: number;
  localOnlyCommits: CommitSummary[];
  localOnlyTotal: number;
  dirty: boolean;
  fastForward: boolean;
  diverged: boolean;
  upToDate: boolean;
}

export interface PullResult {
  branch: string;
  remote: string;
  upstream: string;
  /** `up-to-date` | `fast-forward` | `merge` */
  strategy: string;
  beforeSha: string | null;
  afterSha: string | null;
  incoming: number;
  output: string;
  /** The working tree was moved to `branch` before pulling. */
  switched: boolean;
  previousBranch: string | null;
}

export interface RebasePreview {
  branch: string;
  base: string;
  baseSha: string | null;
  commits: CommitSummary[];
  count: number;
  behindBase: number;
  upstream: string | null;
  dirty: boolean;
  /** The current tip is already on the upstream, so rewriting needs a force push. */
  pushedTip: boolean;
  alreadyBased: boolean;
}

export interface RebaseResult {
  branch: string;
  base: string;
  oldHead: string | null;
  newHead: string;
  replayed: number;
  needsForcePush: boolean;
  output: string;
}

export interface DeleteFailure {
  name: string;
  reason: string;
}

export interface DeleteBranchesResult {
  deleted: string[];
  failed: DeleteFailure[];
  /** Remote refs deleted because the caller asked for it (`origin/foo`). */
  remoteDeleted: string[];
  /** Remote deletions that failed; `name` is the remote ref (`origin/foo`). */
  remoteFailed: DeleteFailure[];
}

export type BranchDateFormat = "yyyyMMdd" | "yyyy-MM-dd" | "yyyyMMdd-HHmm";

export interface BranchTemplate {
  id: string;
  name: string;
  rule: string;
  dateFormat: BranchDateFormat;
  updatedAt: number;
}

export interface AppSettings {
  branchTemplates: BranchTemplate[];
  defaultTemplateId: string | null;
}

export interface RemoteInfo {
  name: string;
  url: string;
  pushUrl: string | null;
  host: string | null;
  isOrigin: boolean;
  trackingBranches: number;
}

export interface RemoveRemoteResult {
  name: string;
  removedTracking: number;
}

export type ConfigSource = "local" | "global" | "none";

export interface RepoIdentity {
  name: string | null;
  nameSource: ConfigSource;
  email: string | null;
  emailSource: ConfigSource;
}

export interface FileDiff {
  path: string;
  oldPath: string | null;
  isBinary: boolean;
  patch: string;
  truncated: boolean;
  additions: number;
  deletions: number;
}

export interface AppError {
  code: string;
  message: string;
}

/** Handle returned by `terminal_open`; everything else about the pty stays in Rust. */
export interface TerminalSessionInfo {
  id: string;
  projectId: string;
  cwd: string;
  shell: string;
}