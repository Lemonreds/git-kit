use std::path::Path;
use std::sync::Mutex;

use tauri::State;

use crate::error::AppError;
use crate::git::{branches, commits, config, diff, ops, repo as git_repo, status, workflow};
use crate::model::{
    AppSettings, BranchSummary, BranchTemplate, CheckoutResult, CherryPickResult, CommitDetail,
    CommitFiles, CommitPage, CommitResult, ComparePreview, CreateBranchResult,
    DeleteBranchesResult, DeleteTagResult, FetchAllResult, FileDiff, HeadCommitPreview,
    MergePreview, MergeResult,
    ProjectList,
    ProjectStatus, ProjectView, PullPreview, PullResult, PushPreview, PushResult, RebasePreview,
    RebaseResult, ReflogEntry, RemoteBranchPage, RemoteInfo, RemoveRemoteResult, RepoIdentity,
    RepoOperationState, RepoSnapshot, ResetResult, SquashPreview, SquashResult, StashList,
    SyncResult, TagInfo, WorktreeStatus,
};
use crate::project_store::{ProjectRecord, ProjectStore};
use crate::settings::SettingsStore;

pub type ProjectStoreState = Mutex<ProjectStore>;
pub type SettingsStoreState = Mutex<SettingsStore>;

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn lock_store<'a>(
    state: &'a State<'_, ProjectStoreState>,
) -> Result<std::sync::MutexGuard<'a, ProjectStore>, AppError> {
    state
        .lock()
        .map_err(|_| AppError::message("项目列表状态异常，请重启应用"))
}

fn to_view(record: &ProjectRecord) -> ProjectView {
    let path = Path::new(&record.path);
    let mut view = ProjectView {
        id: record.id.clone(),
        path: record.path.clone(),
        name: record.name.clone(),
        url: None,
        remote_host: None,
        head_branch: None,
        status: ProjectStatus::Ok,
        status_hint: None,
        added_at: record.added_at,
        last_opened_at: record.last_opened_at,
        pinned: record.pinned,
        pinned_at: record.pinned_at,
    };

    if !path.exists() {
        view.status = ProjectStatus::Missing;
        view.status_hint = Some("文件夹不存在，可能已被移动或删除".to_string());
        return view;
    }

    // Deliberately no worktree status scan here: listing the sidebar must not
    // walk large repositories (slow + extra filesystem permission surface).
    match git_repo::open_repo(&record.path) {
        Ok(repo) => {
            view.url = git_repo::remote_url(&repo);
            view.remote_host = git_repo::remote_host(&repo);
            view.head_branch = git_repo::head_branch(&repo);
        }
        Err(error) => {
            view.status = match error.code() {
                "permission_denied" => ProjectStatus::Denied,
                "not_a_repo" => ProjectStatus::NotRepo,
                _ => ProjectStatus::Missing,
            };
            view.status_hint = Some(error.to_string());
        }
    }

    view
}

#[tauri::command(async)]
pub fn list_projects(state: State<'_, ProjectStoreState>) -> Result<ProjectList, AppError> {
    let store = lock_store(&state)?;
    Ok(ProjectList {
        projects: store.projects().iter().map(to_view).collect(),
        last_active_id: store.last_active_id().map(str::to_string),
    })
}

#[tauri::command(async)]
pub fn add_project(
    path: String,
    state: State<'_, ProjectStoreState>,
) -> Result<ProjectView, AppError> {
    let canonical = git_repo::canonical_path(&path)?;
    let canonical_str = canonical.display().to_string();
    let repo = git_repo::open_repo(&canonical_str)?;
    let name = git_repo::display_name(&repo, &canonical);

    let mut store = lock_store(&state)?;
    let existing = store.find_by_path(&canonical_str).cloned();
    let id = existing
        .as_ref()
        .map(|project| project.id.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let added_at = existing
        .as_ref()
        .map_or_else(now, |project| project.added_at);

    let record = ProjectRecord {
        id: id.clone(),
        path: canonical_str,
        name,
        added_at,
        last_opened_at: now(),
        pinned: existing.as_ref().is_some_and(|project| project.pinned),
        pinned_at: existing.as_ref().and_then(|project| project.pinned_at),
    };
    store.upsert(record)?;
    store.set_last_active(Some(id))?;

    let saved = store
        .find_by_path(&canonical.display().to_string())
        .cloned()
        .ok_or_else(|| AppError::message("项目保存失败"))?;
    Ok(to_view(&saved))
}

/// Point an existing sidebar entry at a new folder (moved repo, revoked
/// access, external drive). Keeps the same id so selection survives.
#[tauri::command(async)]
pub fn relink_project(
    id: String,
    path: String,
    state: State<'_, ProjectStoreState>,
) -> Result<ProjectView, AppError> {
    let canonical = git_repo::canonical_path(&path)?;
    let canonical_str = canonical.display().to_string();
    let repo = git_repo::open_repo(&canonical_str)?;
    let name = git_repo::display_name(&repo, &canonical);

    let mut store = lock_store(&state)?;
    let added_at = store.find(&id).map_or_else(now, |project| project.added_at);
    let pinned = store.find(&id).is_some_and(|project| project.pinned);
    let pinned_at = store.find(&id).and_then(|project| project.pinned_at);
    store.upsert(ProjectRecord {
        id: id.clone(),
        path: canonical_str,
        name,
        added_at,
        last_opened_at: now(),
        pinned,
        pinned_at,
    })?;
    store.set_last_active(Some(id.clone()))?;

    let saved = store
        .find(&id)
        .cloned()
        .ok_or_else(|| AppError::message("项目保存失败"))?;
    Ok(to_view(&saved))
}

#[tauri::command(async)]
pub fn remove_project(id: String, state: State<'_, ProjectStoreState>) -> Result<(), AppError> {
    let mut store = lock_store(&state)?;
    store.remove(&id)
}

#[tauri::command(async)]
pub fn set_active_project(
    id: Option<String>,
    state: State<'_, ProjectStoreState>,
) -> Result<(), AppError> {
    let mut store = lock_store(&state)?;
    if let Some(active) = id.as_deref() {
        let existing = store
            .find(active)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("项目 {active}")))?;
        store.upsert(ProjectRecord {
            id: active.to_string(),
            path: existing.path,
            name: existing.name,
            added_at: existing.added_at,
            last_opened_at: now(),
            pinned: existing.pinned,
            pinned_at: existing.pinned_at,
        })?;
    }
    store.set_last_active(id)
}

#[tauri::command(async)]
pub fn set_project_pinned(
    id: String,
    pinned: bool,
    state: State<'_, ProjectStoreState>,
) -> Result<ProjectView, AppError> {
    let mut store = lock_store(&state)?;
    store.set_pinned(&id, pinned, now())?;
    let saved = store
        .find(&id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("项目 {id}")))?;
    Ok(to_view(&saved))
}

#[tauri::command(async)]
pub fn get_repo_snapshot(path: String) -> Result<RepoSnapshot, AppError> {
    let canonical = git_repo::canonical_path(&path)?;
    let repo = git_repo::open_repo(&canonical.display().to_string())?;
    Ok(git_repo::snapshot(&repo, &canonical))
}

#[tauri::command(async)]
pub fn list_remotes(repo_path: String) -> Result<Vec<RemoteInfo>, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    Ok(config::list_remotes(&repo))
}

#[tauri::command(async)]
pub fn add_remote(repo_path: String, name: String, url: String) -> Result<RemoteInfo, AppError> {
    config::add_remote(std::path::Path::new(&repo_path), &name, &url)
}

#[tauri::command(async)]
pub fn remove_remote(repo_path: String, name: String) -> Result<RemoveRemoteResult, AppError> {
    config::remove_remote(std::path::Path::new(&repo_path), &name)
}

#[tauri::command(async)]
pub fn get_repo_identity(repo_path: String) -> Result<RepoIdentity, AppError> {
    config::read_identity(std::path::Path::new(&repo_path))
}

#[tauri::command(async)]
pub fn set_repo_identity(
    repo_path: String,
    name: String,
    email: String,
) -> Result<RepoIdentity, AppError> {
    config::set_identity(std::path::Path::new(&repo_path), &name, &email)
}

#[tauri::command(async)]
pub fn list_branches(
    repo_path: String,
    include_remote: Option<bool>,
) -> Result<Vec<BranchSummary>, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    branches::list_branches(&repo, include_remote.unwrap_or(false))
}

/// Remote branches already fetched into the repo — no network access. Only the
/// newest `limit` (default 50) are returned, plus the total count.
#[tauri::command(async)]
pub fn list_remote_branches(
    repo_path: String,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<RemoteBranchPage, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    let limit = limit.unwrap_or(branches::REMOTE_BRANCH_PAGE);
    let offset = offset.unwrap_or(0);
    let list = branches::list_remote_branches(&repo, limit, offset)?;
    Ok(RemoteBranchPage {
        total: branches::count_remote_branches(&repo)?,
        branches: list,
        limit,
        offset,
    })
}

#[tauri::command(async)]
pub fn list_commits(
    repo_path: String,
    rev: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<CommitPage, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    commits::list_commits(
        &repo,
        &rev,
        offset.unwrap_or(0),
        limit.unwrap_or(commits::DEFAULT_PAGE_SIZE),
    )
}

#[tauri::command(async)]
pub fn get_commit(repo_path: String, sha: String) -> Result<CommitDetail, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    commits::commit_detail(&repo, &sha)
}

#[tauri::command(async)]
pub fn get_commit_files(repo_path: String, sha: String) -> Result<CommitFiles, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    let oid =
        git_repo::resolve_rev(&repo, &sha).ok_or_else(|| AppError::CommitNotFound(sha.clone()))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|_| AppError::CommitNotFound(sha.clone()))?;
    let files = diff::commit_files(&repo, &commit)?;
    Ok(CommitFiles {
        sha: commit.id().to_string(),
        short_sha: git_repo::short_id(&commit),
        is_merge: commit.parent_count() > 1,
        files,
    })
}

#[tauri::command(async)]
pub fn get_file_diff(
    repo_path: String,
    sha: String,
    path: String,
    old_path: Option<String>,
    context_lines: Option<u32>,
) -> Result<FileDiff, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    let oid =
        git_repo::resolve_rev(&repo, &sha).ok_or_else(|| AppError::CommitNotFound(sha.clone()))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|_| AppError::CommitNotFound(sha.clone()))?;
    diff::file_diff(
        &repo,
        &commit,
        &path,
        old_path.as_deref(),
        context_lines.unwrap_or(3),
    )
}

#[tauri::command(async)]
pub fn get_file_content(
    repo_path: String,
    sha: String,
    path: String,
) -> Result<String, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    diff::get_file_content(&repo, &sha, &path)
}

#[tauri::command(async)]
pub fn get_worktree_status(repo_path: String) -> Result<WorktreeStatus, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    status::worktree_status(&repo)
}

#[tauri::command(async)]
pub fn stage_file(repo_path: String, path: String) -> Result<WorktreeStatus, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    status::stage_file(&repo, &path)?;
    status::worktree_status(&repo)
}

#[tauri::command(async)]
pub fn unstage_file(repo_path: String, path: String) -> Result<WorktreeStatus, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    status::unstage_file(&repo, &path)?;
    status::worktree_status(&repo)
}

#[tauri::command(async)]
pub fn discard_file(repo_path: String, path: String) -> Result<WorktreeStatus, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    status::discard_file(&repo, &path)?;
    status::worktree_status(&repo)
}

#[tauri::command(async)]
pub fn stage_all(repo_path: String) -> Result<WorktreeStatus, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    status::stage_all(&repo)?;
    status::worktree_status(&repo)
}

#[tauri::command(async)]
pub fn unstage_all(repo_path: String) -> Result<WorktreeStatus, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    status::unstage_all(&repo)?;
    status::worktree_status(&repo)
}

#[tauri::command(async)]
pub fn discard_all(repo_path: String) -> Result<WorktreeStatus, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    status::discard_all(&repo)?;
    status::worktree_status(&repo)
}

#[tauri::command(async)]
pub fn get_worktree_diff(
    repo_path: String,
    path: String,
    staged: bool,
    context_lines: Option<u32>,
) -> Result<FileDiff, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    diff::worktree_file_diff(&repo, &path, staged, context_lines.unwrap_or(3))
}

#[tauri::command(async)]
pub fn squash_preview(repo_path: String, branch: String) -> Result<SquashPreview, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    ops::squash_preview(&repo, &branch)
}

#[tauri::command(async)]
pub fn squash_commits(
    repo_path: String,
    branch: String,
    count: usize,
    message: String,
) -> Result<SquashResult, AppError> {
    ops::squash_commits(std::path::Path::new(&repo_path), &branch, count, &message)
}

#[tauri::command(async)]
pub fn cherry_pick(
    repo_path: String,
    source_branch: String,
    target_branch: String,
    shas: Vec<String>,
) -> Result<CherryPickResult, AppError> {
    ops::cherry_pick(
        std::path::Path::new(&repo_path),
        &source_branch,
        &target_branch,
        &shas,
    )
}

#[tauri::command(async)]
pub fn create_branch(
    repo_path: String,
    name: String,
    base_ref: String,
    checkout: Option<bool>,
) -> Result<CreateBranchResult, AppError> {
    ops::create_branch(
        std::path::Path::new(&repo_path),
        &name,
        &base_ref,
        checkout.unwrap_or(true),
    )
}

/// Switch the working tree to an existing local branch.
#[tauri::command(async)]
pub fn checkout_branch(repo_path: String, branch: String) -> Result<CheckoutResult, AppError> {
    ops::checkout_branch(std::path::Path::new(&repo_path), &branch)
}

/// Local-only branch deletion. Never deletes remote branches.
#[tauri::command(async)]
pub fn delete_local_branches(
    repo_path: String,
    names: Vec<String>,
    force_unmerged: Option<bool>,
    delete_remote: Option<bool>,
) -> Result<DeleteBranchesResult, AppError> {
    ops::delete_branches(
        std::path::Path::new(&repo_path),
        &names,
        force_unmerged.unwrap_or(false),
        delete_remote.unwrap_or(false),
    )
}

#[tauri::command(async)]
pub fn push_preview(repo_path: String, branch: String) -> Result<PushPreview, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    ops::push_preview(&repo, &branch)
}

#[tauri::command(async)]
pub fn pull_preview(repo_path: String, branch: String) -> Result<PullPreview, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    ops::pull_preview(&repo, &branch)
}

/// `git fetch` + fast-forward / merge into `branch` (switching first when asked).
#[tauri::command(async)]
pub fn pull_branch(
    repo_path: String,
    branch: String,
    allow_merge: Option<bool>,
    switch_first: Option<bool>,
) -> Result<PullResult, AppError> {
    ops::pull_branch(
        std::path::Path::new(&repo_path),
        &branch,
        allow_merge.unwrap_or(false),
        switch_first.unwrap_or(false),
    )
}

#[tauri::command(async)]
pub fn rebase_preview(
    repo_path: String,
    branch: String,
    base_ref: String,
) -> Result<RebasePreview, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    ops::rebase_preview(&repo, &branch, &base_ref)
}

/// `git rebase <base>` on `branch`; conflicts come back as `rebase_conflict`.
#[tauri::command(async)]
pub fn rebase_branch(
    repo_path: String,
    branch: String,
    base_ref: String,
) -> Result<RebaseResult, AppError> {
    ops::rebase_branch(std::path::Path::new(&repo_path), &branch, &base_ref)
}

#[tauri::command(async)]
pub fn get_settings(state: State<'_, SettingsStoreState>) -> Result<AppSettings, AppError> {
    let store = state
        .lock()
        .map_err(|_| AppError::message("设置状态异常，请重启应用"))?;
    Ok(store.settings())
}

#[tauri::command(async)]
pub fn save_branch_templates(
    templates: Vec<BranchTemplate>,
    default_template_id: Option<String>,
    state: State<'_, SettingsStoreState>,
) -> Result<AppSettings, AppError> {
    let mut store = state
        .lock()
        .map_err(|_| AppError::message("设置状态异常，请重启应用"))?;
    store.save_templates(templates, default_template_id)
}

#[tauri::command(async)]
pub fn push_branch(
    repo_path: String,
    branch: String,
    force: Option<bool>,
) -> Result<PushResult, AppError> {
    ops::push_branch(
        std::path::Path::new(&repo_path),
        &branch,
        force.unwrap_or(false),
    )
}

/// Commit whatever is currently in the index.
#[tauri::command(async)]
pub fn commit_staged(repo_path: String, message: String) -> Result<CommitResult, AppError> {
    ops::commit_staged(std::path::Path::new(&repo_path), &message)
}

#[tauri::command(async)]
pub fn sync_branch(repo_path: String, branch: String) -> Result<SyncResult, AppError> {
    ops::sync_branch(std::path::Path::new(&repo_path), &branch)
}

/// `git fetch --all --prune`: refresh every remote at once.
#[tauri::command(async)]
pub fn fetch_all(repo_path: String) -> Result<FetchAllResult, AppError> {
    ops::fetch_all(std::path::Path::new(&repo_path))
}

// --- P0 / P1 / P2 workflow commands ----------------------------------------

#[tauri::command(async)]
pub fn get_repo_state(repo_path: String) -> Result<RepoOperationState, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    Ok(workflow::repo_state(&repo))
}

/// `action` is `continue` / `skip` / `abort`.
#[tauri::command(async)]
pub fn repo_operation_action(
    repo_path: String,
    action: String,
) -> Result<RepoOperationState, AppError> {
    workflow::operation_action(std::path::Path::new(&repo_path), &action)
}

#[tauri::command(async)]
pub fn stash_list(repo_path: String) -> Result<StashList, AppError> {
    workflow::stash_list(std::path::Path::new(&repo_path))
}

#[tauri::command(async)]
pub fn stash_push(
    repo_path: String,
    message: Option<String>,
    include_untracked: Option<bool>,
) -> Result<StashList, AppError> {
    workflow::stash_push(
        std::path::Path::new(&repo_path),
        message.as_deref().unwrap_or(""),
        include_untracked.unwrap_or(false),
    )
}

#[tauri::command(async)]
pub fn stash_pop(repo_path: String, index: usize) -> Result<StashList, AppError> {
    workflow::stash_pop(std::path::Path::new(&repo_path), index)
}

#[tauri::command(async)]
pub fn stash_drop(repo_path: String, index: usize) -> Result<StashList, AppError> {
    workflow::stash_drop(std::path::Path::new(&repo_path), index)
}

#[tauri::command(async)]
pub fn head_commit_preview(repo_path: String) -> Result<HeadCommitPreview, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    workflow::head_commit_preview(&repo)
}

#[tauri::command(async)]
pub fn amend_commit(repo_path: String, message: String) -> Result<CommitResult, AppError> {
    workflow::amend_commit(std::path::Path::new(&repo_path), &message)
}

#[tauri::command(async)]
pub fn ignore_path(repo_path: String, path: String, is_dir: Option<bool>) -> Result<(), AppError> {
    workflow::ignore_path(
        std::path::Path::new(&repo_path),
        &path,
        is_dir.unwrap_or(false),
    )
}

#[tauri::command(async)]
pub fn merge_preview(repo_path: String, source: String) -> Result<MergePreview, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    workflow::merge_preview(&repo, &source)
}

#[tauri::command(async)]
pub fn merge_branch(
    repo_path: String,
    source: String,
    no_ff: Option<bool>,
) -> Result<MergeResult, AppError> {
    workflow::merge_branch(
        std::path::Path::new(&repo_path),
        &source,
        no_ff.unwrap_or(false),
    )
}

#[tauri::command(async)]
pub fn revert_commit(repo_path: String, sha: String) -> Result<CommitResult, AppError> {
    workflow::revert_commit(std::path::Path::new(&repo_path), &sha)
}

#[tauri::command(async)]
pub fn list_tags(repo_path: String) -> Result<Vec<TagInfo>, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    workflow::list_tags(&repo)
}

#[tauri::command(async)]
pub fn create_tag(
    repo_path: String,
    name: String,
    target: String,
    message: Option<String>,
) -> Result<Vec<TagInfo>, AppError> {
    workflow::create_tag(
        std::path::Path::new(&repo_path),
        &name,
        &target,
        message.as_deref().unwrap_or(""),
    )
}

#[tauri::command(async)]
pub fn delete_tag(
    repo_path: String,
    name: String,
    delete_remote: Option<bool>,
) -> Result<DeleteTagResult, AppError> {
    workflow::delete_tag(
        std::path::Path::new(&repo_path),
        &name,
        delete_remote.unwrap_or(false),
    )
}

#[tauri::command(async)]
pub fn push_tag(repo_path: String, name: String) -> Result<String, AppError> {
    workflow::push_tag(std::path::Path::new(&repo_path), &name)
}

#[tauri::command(async)]
pub fn reflog_entries(
    repo_path: String,
    limit: Option<usize>,
) -> Result<Vec<ReflogEntry>, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    workflow::reflog_entries(&repo, limit.unwrap_or(20))
}

#[tauri::command(async)]
pub fn reset_to(
    repo_path: String,
    sha: String,
    hard: Option<bool>,
) -> Result<ResetResult, AppError> {
    workflow::reset_to(
        std::path::Path::new(&repo_path),
        &sha,
        hard.unwrap_or(false),
    )
}

#[tauri::command(async)]
pub fn compare_refs(
    repo_path: String,
    base: String,
    head: String,
) -> Result<ComparePreview, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    workflow::compare_refs(&repo, &base, &head)
}

#[tauri::command(async)]
pub fn compare_file_diff(
    repo_path: String,
    base: String,
    head: String,
    path: String,
    old_path: Option<String>,
    context_lines: Option<u32>,
) -> Result<FileDiff, AppError> {
    let repo = git_repo::open_repo(&repo_path)?;
    let base_oid = git_repo::resolve_rev(&repo, &base)
        .ok_or_else(|| AppError::message(format!("找不到基线 {base}")))?;
    let head_oid = git_repo::resolve_rev(&repo, &head)
        .ok_or_else(|| AppError::message(format!("找不到对比分支 {head}")))?;
    diff::ref_file_diff(
        &repo,
        Some(base_oid),
        head_oid,
        &path,
        old_path.as_deref(),
        context_lines.unwrap_or(3),
    )
}
