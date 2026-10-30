use serde::{Deserialize, Serialize};

/// Why a saved project can not be read right now. `Ok` means fully usable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Ok,
    Missing,
    Denied,
    NotRepo,
}

/// A project the user opened. `url` / `head_branch` / `missing` are resolved
/// when listing, so a deleted folder degrades gracefully instead of failing
/// the whole sidebar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectView {
    pub id: String,
    pub path: String,
    pub name: String,
    pub url: Option<String>,
    pub remote_host: Option<String>,
    pub head_branch: Option<String>,
    pub status: ProjectStatus,
    /// Human hint shown next to an unreadable project (never a raw libgit2 text).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_hint: Option<String>,
    pub added_at: i64,
    pub last_opened_at: i64,
    /// Pinned projects sit in their own group above the sorted list.
    pub pinned: bool,
    pub pinned_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectList {
    pub projects: Vec<ProjectView>,
    pub last_active_id: Option<String>,
}

/// Compact commit row used by branch cards and commit history.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub sha: String,
    pub short_sha: String,
    pub summary: String,
    pub author_name: String,
    pub author_email: String,
    pub committed_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitPage {
    pub commits: Vec<CommitSummary>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub sha: String,
    pub short_sha: String,
    pub summary: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub committed_at: i64,
    pub parents: Vec<String>,
    pub is_merge: bool,
    pub files_changed: usize,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchSummary {
    /// Full ref name, e.g. `refs/heads/main` — unique and safe as a revwalk rev.
    pub ref_name: String,
    /// Display name, e.g. `main` or `origin/main`.
    pub name: String,
    /// Branch name without the remote prefix (`feature/x` for `origin/feature/x`).
    pub short_name: String,
    pub is_head: bool,
    pub is_remote: bool,
    /// A local branch with the same short name exists (remote rows only).
    pub has_local: bool,
    pub upstream: Option<String>,
    pub ahead: Option<usize>,
    pub behind: Option<usize>,
    pub last_commit: Option<CommitSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranchPage {
    pub branches: Vec<BranchSummary>,
    /// Total remote-tracking branches known locally (may exceed `branches`).
    pub total: usize,
    pub limit: usize,
    /// How many newest branches were skipped (paging support).
    pub offset: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    TypeChange,
    Untracked,
    Conflicted,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    /// Path after the change (or the old path for deletions).
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub additions: usize,
    pub deletions: usize,
    pub is_binary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFiles {
    pub sha: String,
    pub short_sha: String,
    pub is_merge: bool,
    pub files: Vec<FileChange>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub is_binary: bool,
    /// Unified diff text (`@@` hunks, `+`/`-` lines).
    pub patch: String,
    pub truncated: bool,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSnapshot {
    pub path: String,
    pub name: String,
    pub url: Option<String>,
    /// Host only (`github.com`) — the footer shows this instead of the full URL.
    pub remote_host: Option<String>,
    pub head_branch: Option<String>,
    pub is_dirty: bool,
    pub is_bare: bool,
}

/// One changed path in the worktree, split by index / worktree side so the UI
/// can render the "staged" and "unstaged" groups like VS Code.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeEntry {
    pub path: String,
    pub old_path: Option<String>,
    /// index vs HEAD
    pub staged: Option<FileStatus>,
    /// worktree vs index (untracked files land here as `untracked`)
    pub unstaged: Option<FileStatus>,
    pub conflicted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeStatus {
    pub head_branch: Option<String>,
    pub entries: Vec<WorktreeEntry>,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub conflicted_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SquashPreview {
    pub branch: String,
    /// `master` / `origin/main` / … used to count the branch's own commits.
    pub base_branch: Option<String>,
    pub base_sha: Option<String>,
    pub count: usize,
    pub total_commits: usize,
    pub oldest_sha: Option<String>,
    pub oldest_message: Option<String>,
    /// The commits that `reset --soft HEAD~count` will squash, newest first.
    pub commits: Vec<CommitSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SquashResult {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub squashed: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CherryPickResult {
    pub target_branch: String,
    pub picked: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub branch: String,
    pub remote: String,
    pub forced: bool,
    pub output: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub branch: String,
    pub remote: String,
    pub upstream: Option<String>,
    pub ahead: Option<usize>,
    pub behind: Option<usize>,
    pub output: String,
}

/// Result of `git fetch --all --prune` (every remote at once).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchAllResult {
    /// Remotes that were fetched.
    pub remotes: Vec<String>,
    /// Raw `git fetch` output; empty means every ref was already up to date.
    pub output: String,
}

/// Result of committing the index.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub branch: Option<String>,
    pub files_changed: usize,
    /// An amend after the commit was pushed needs a force push.
    pub needs_force_push: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetResult {
    pub sha: String,
    pub short_sha: String,
    /// `mixed` / `hard`
    pub mode: String,
}

/// What `git fetch` + merge would bring into the current branch, computed from
/// refs already fetched locally (no network).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullPreview {
    pub branch: String,
    pub remote: String,
    pub upstream: Option<String>,
    /// The remote-tracking ref exists (otherwise there is nothing to pull yet).
    pub remote_exists: bool,
    pub local_sha: Option<String>,
    pub remote_sha: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    /// Commits only on the remote, newest first (capped).
    pub incoming_commits: Vec<CommitSummary>,
    pub incoming_total: usize,
    /// Commits only local — they force a real merge instead of a fast-forward.
    pub local_only_commits: Vec<CommitSummary>,
    pub local_only_total: usize,
    pub dirty: bool,
    pub fast_forward: bool,
    pub diverged: bool,
    pub up_to_date: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub branch: String,
    pub remote: String,
    pub upstream: String,
    /// `up-to-date` / `fast-forward` / `merge`
    pub strategy: String,
    pub before_sha: Option<String>,
    pub after_sha: Option<String>,
    pub incoming: usize,
    pub output: String,
    /// The working tree was moved to `branch` before pulling.
    pub switched: bool,
    pub previous_branch: Option<String>,
}

/// What `git rebase <base>` would replay, computed without touching anything.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebasePreview {
    pub branch: String,
    pub base: String,
    pub base_sha: Option<String>,
    /// Commits of `branch` that are not in `base`, newest first.
    pub commits: Vec<CommitSummary>,
    pub count: usize,
    /// Commits `base` has that `branch` does not (they arrive via the rebase).
    pub behind_base: usize,
    pub upstream: Option<String>,
    pub dirty: bool,
    /// The current tip is already on the upstream, so rewriting needs a force push.
    pub pushed_tip: bool,
    pub already_based: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseResult {
    pub branch: String,
    pub base: String,
    pub old_head: Option<String>,
    pub new_head: String,
    pub replayed: usize,
    pub needs_force_push: bool,
    pub output: String,
}

/// What `git push` would do, computed from local remote-tracking refs only (no
/// network) so the dialog opens instantly. A `behind > 0` push is rejected by
/// the server unless it is forced.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushPreview {
    pub branch: String,
    pub remote: String,
    pub upstream: Option<String>,
    /// The remote-tracking ref already exists (otherwise this is a new branch).
    pub remote_exists: bool,
    pub local_sha: Option<String>,
    pub remote_sha: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    /// Commits only in the local branch, newest first (capped).
    pub push_commits: Vec<CommitSummary>,
    /// Commits only on the remote, newest first — these get overwritten by a
    /// force push.
    pub remote_only_commits: Vec<CommitSummary>,
    pub remote_only_total: usize,
    pub requires_force: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBranchResult {
    pub branch: String,
    pub ref_name: String,
    pub base: String,
    pub base_sha: String,
    pub checked_out: bool,
    pub upstream: Option<String>,
}

/// Result of switching the working tree to another local branch.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutResult {
    pub branch: String,
    pub short_sha: String,
    /// `false` when the branch was already checked out.
    pub switched: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFailure {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteBranchesResult {
    pub deleted: Vec<String>,
    pub failed: Vec<DeleteFailure>,
    /// Remote refs deleted because the caller asked for it (`origin/foo`).
    pub remote_deleted: Vec<String>,
    /// Remote deletions that failed; `name` is the remote ref (`origin/foo`).
    pub remote_failed: Vec<DeleteFailure>,
}

/// A branch-name template: `rule` mixes literal text with the `{date}` token,
/// e.g. `prod_{date}_BASE` → `prod_20261029_BASE`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchTemplate {
    pub id: String,
    pub name: String,
    pub rule: String,
    /// `yyyyMMdd` (default), `yyyy-MM-dd` or `yyyyMMdd-HHmm`.
    #[serde(default = "default_date_format")]
    pub date_format: String,
    #[serde(default)]
    pub updated_at: i64,
}

pub fn default_date_format() -> String {
    "yyyyMMdd".to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub branch_templates: Vec<BranchTemplate>,
    pub default_template_id: Option<String>,
}

/// A configured remote of the current repository.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
    /// Different push target when `pushurl` is configured.
    pub push_url: Option<String>,
    /// Host only (`github.com`) — mirrors the footer label.
    pub host: Option<String>,
    pub is_origin: bool,
    /// How many `refs/remotes/<name>/*` refs already exist.
    pub tracking_branches: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigSource {
    Local,
    Global,
    None,
}

/// Commit identity of the repository, with where each value comes from.
/// Only the `local` values are ever written by the app.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoIdentity {
    pub name: Option<String>,
    pub name_source: ConfigSource,
    pub email: Option<String>,
    pub email_source: ConfigSource,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveRemoteResult {
    pub name: String,
    /// Remote-tracking refs that git removed together with the remote.
    pub removed_tracking: usize,
}

// ---------------------------------------------------------------------------
// P0: in-progress operations, stash, amend, ignore, merge, revert, tags, reflog
// ---------------------------------------------------------------------------

/// A merge / rebase / cherry-pick / revert that stopped (usually on conflicts).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoOperationState {
    /// `none` / `merge` / `rebase` / `cherry-pick` / `revert`
    pub kind: String,
    pub conflicts: Vec<String>,
    pub can_skip: bool,
    /// e.g. `rebase 2/5`
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    /// `stash@{0}` — safe to pass back to git.
    pub selector: String,
    pub index: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashList {
    pub entries: Vec<StashEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadCommitPreview {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub files_changed: usize,
    /// The commit is already on the upstream, so amending needs a force push.
    pub pushed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePreview {
    pub source: String,
    pub source_sha: String,
    pub commits: Vec<CommitSummary>,
    pub count: usize,
    pub can_fast_forward: bool,
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub source: String,
    /// `fast-forward` / `merge` / `up-to-date`
    pub strategy: String,
    pub commits: usize,
    pub short_sha: String,
}

/// Result of deleting a tag, optionally including the `origin` copy.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTagResult {
    pub tags: Vec<TagInfo>,
    /// True when the tag was also removed from `origin`.
    pub remote_deleted: bool,
    /// Why the remote tag was kept, when `delete_remote` was requested.
    pub remote_failure: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub sha: String,
    pub short_sha: String,
    pub annotated: bool,
    pub message: Option<String>,
    pub created_at: Option<i64>,
    /// A commit-like name for display (`HEAD`, `origin/main`, …).
    pub target: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub index: usize,
    pub sha: String,
    pub short_sha: String,
    pub action: String,
    pub message: String,
    pub when: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparePreview {
    pub base: String,
    pub head: String,
    pub commits: Vec<CommitSummary>,
    pub commit_count: usize,
    pub files: Vec<FileChange>,
    pub additions: usize,
    pub deletions: usize,
}
