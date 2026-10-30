use std::path::Path;

use git2::{BranchType, Oid, Repository, Sort};

use crate::error::AppError;
use crate::model::{
    CheckoutResult, CherryPickResult, CommitResult, CommitSummary, CreateBranchResult,
    DeleteBranchesResult, DeleteFailure, FetchAllResult, PullPreview, PullResult, PushPreview,
    PushResult, RebasePreview, RebaseResult, SquashPreview, SquashResult, SyncResult,
};

use super::cli::{
    NETWORK_TIMEOUT, ensure_branch_checked_out, ensure_clean_worktree, run, run_blocking,
};
use super::repo::{open_repo, remote_names, resolve_rev, short_id, summarize};

const MAX_SCAN: usize = 5000;
/// How many commit rows a preview lists (the counts stay exact).
const MAX_LISTED_COMMITS: usize = 50;

fn open(path: &Path) -> Result<Repository, AppError> {
    open_repo(&path.display().to_string())
}

fn branch_tip(repo: &Repository, branch: &str) -> Result<Oid, AppError> {
    let found = repo
        .find_branch(branch, BranchType::Local)
        .map_err(|_| AppError::message(format!("找不到本地分支 {branch}")))?;
    found
        .get()
        .peel_to_commit()
        .map(|commit| commit.id())
        .map_err(|_| AppError::message(format!("分支 {branch} 还没有任何提交")))
}

fn base_label(ref_name: &str) -> String {
    ref_name
        .trim_start_matches("refs/heads/")
        .trim_start_matches("refs/remotes/")
        .to_string()
}

/// The branch the current one was most likely created from: `master`, `main`,
/// their remote counterparts, the configured upstream, then any other branch.
fn detect_base(repo: &Repository, branch: &str) -> Option<(String, Oid)> {
    let candidates = [
        "refs/heads/master",
        "refs/heads/main",
        "refs/remotes/origin/master",
        "refs/remotes/origin/main",
    ];

    for name in candidates {
        if base_label(name) == branch {
            continue;
        }
        if let Ok(oid) = repo.refname_to_id(name) {
            return Some((base_label(name), oid));
        }
    }

    if let Ok(local) = repo.find_branch(branch, BranchType::Local) {
        if let Ok(upstream) = local.upstream() {
            if let (Ok(Some(name)), Some(oid)) = (upstream.name(), upstream.get().target()) {
                return Some((base_label(name), oid));
            }
        }
    }

    let mut others: Vec<String> = repo
        .branches(Some(BranchType::Local))
        .ok()?
        .flatten()
        .filter_map(|(branch, _)| branch.name().ok().flatten().map(str::to_string))
        .filter(|name| name != branch)
        .collect();
    others.sort();
    others
        .first()
        .and_then(|name| repo.refname_to_id(&format!("refs/heads/{name}")).ok())
        .map(|oid| (others[0].clone(), oid))
}

struct RangeScan {
    count: usize,
    oldest_sha: Option<String>,
    oldest_message: Option<String>,
    commits: Vec<CommitSummary>,
}

/// Count commits along the first-parent chain, which is exactly what
/// `HEAD~N` addresses. The last visited commit is the one whose message is the
/// natural default for a squash.
fn scan_first_parent(
    repo: &Repository,
    tip: Oid,
    stop: Option<Oid>,
) -> Result<RangeScan, AppError> {
    let mut current = repo
        .find_commit(tip)
        .map_err(|_| AppError::message("无法读取分支的最新提交"))?;
    let mut count = 0;
    let mut oldest: Option<(String, String)> = None;
    let mut commits: Vec<CommitSummary> = Vec::new();

    loop {
        if stop == Some(current.id()) {
            break;
        }
        count += 1;
        oldest = Some((
            current.id().to_string(),
            current.message().unwrap_or_default().trim_end().to_string(),
        ));
        if commits.len() < MAX_LISTED_COMMITS {
            commits.push(summarize(&current));
        }

        if count >= MAX_SCAN {
            break;
        }
        match current.parents().next() {
            Some(parent) => current = parent,
            None => break,
        }
    }

    Ok(match oldest {
        Some((sha, message)) => RangeScan {
            count,
            oldest_sha: Some(sha),
            oldest_message: Some(message),
            commits,
        },
        None => RangeScan {
            count,
            oldest_sha: None,
            oldest_message: None,
            commits,
        },
    })
}

pub fn squash_preview(repo: &Repository, branch: &str) -> Result<SquashPreview, AppError> {
    let tip = branch_tip(repo, branch)?;
    let base = detect_base(repo, branch);
    let hide = base
        .as_ref()
        .and_then(|(_, oid)| repo.merge_base(tip, *oid).ok());

    let range = scan_first_parent(repo, tip, hide)?;
    let total = scan_first_parent(repo, tip, None)?;

    Ok(SquashPreview {
        branch: branch.to_string(),
        base_branch: base.map(|(name, _)| name),
        base_sha: hide.map(|oid| oid.to_string()),
        count: range.count,
        total_commits: total.count,
        oldest_sha: range.oldest_sha,
        oldest_message: range.oldest_message,
        commits: range.commits,
    })
}

fn command_detail(error: &AppError) -> String {
    match error {
        AppError::CommandFailed(detail) => detail.clone(),
        other => other.to_string(),
    }
}

/// `reset --soft HEAD~N` + `git commit`: the only way to actually turn N commits
/// into one while keeping the tree intact.
pub fn squash_commits(
    repo_path: &Path,
    branch: &str,
    count: usize,
    message: &str,
) -> Result<SquashResult, AppError> {
    let message = message.trim();
    if count == 0 {
        return Err(AppError::message("压缩个数至少为 1"));
    }
    if message.is_empty() {
        return Err(AppError::message("提交信息不能为空"));
    }
    if branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{branch}")));
    }

    ensure_clean_worktree(repo_path)?;
    ensure_branch_checked_out(repo_path, branch)?;

    let repo = open(repo_path)?;
    let tip = branch_tip(&repo, branch)?;
    let total = scan_first_parent(&repo, tip, None)?.count;
    if count > total {
        return Err(AppError::message(format!(
            "分支只有 {total} 个提交，无法压缩 {count} 个"
        )));
    }

    let range = format!("HEAD~{count}");
    run_blocking(repo_path, &["reset", "--soft", &range]).map_err(|error| {
        AppError::CommandFailed(format!(
            "执行 git reset --soft {range} 失败：{}",
            command_detail(&error)
        ))
    })?;

    // GPG signing is disabled here: a signing prompt would silently block the
    // app. Hooks still run, and a failure leaves the squash in the index.
    if let Err(error) = run_blocking(repo_path, &["commit", "--no-gpg-sign", "-m", message]) {
        return Err(AppError::CommandFailed(format!(
            "已执行 reset --soft {range}，但提交失败：{}\n改动仍保留在暂存区，可手动执行 git commit 完成压缩",
            command_detail(&error)
        )));
    }

    let repo = open(repo_path)?;
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| AppError::message("压缩后无法读取新的提交"))?;

    Ok(SquashResult {
        sha: head.id().to_string(),
        short_sha: short_id(&head),
        message: message.to_string(),
        squashed: count,
    })
}

pub(crate) fn conflict_paths(repo_path: &Path) -> Vec<String> {
    let Ok(repo) = open(repo_path) else {
        return Vec::new();
    };
    let Ok(index) = repo.index() else {
        return Vec::new();
    };
    let Ok(conflicts) = index.conflicts() else {
        return Vec::new();
    };

    let mut paths: Vec<String> = conflicts
        .flatten()
        .filter_map(|conflict| {
            let entry = conflict.our.or(conflict.their);
            entry.map(|entry| String::from_utf8_lossy(&entry.path).to_string())
        })
        .collect();
    paths.sort();
    paths.dedup();
    paths
}

pub fn cherry_pick(
    repo_path: &Path,
    source_branch: &str,
    target_branch: &str,
    shas: &[String],
) -> Result<CherryPickResult, AppError> {
    if shas.is_empty() {
        return Err(AppError::message("请至少选择一个提交"));
    }
    if source_branch == target_branch {
        return Err(AppError::message("目标分支不能与源分支相同"));
    }
    if target_branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{target_branch}")));
    }

    ensure_clean_worktree(repo_path)?;

    let repo = open(repo_path)?;
    repo.find_branch(target_branch, BranchType::Local)
        .map_err(|_| AppError::message(format!("找不到本地分支 {target_branch}")))?;

    let mut ordered: Vec<(i64, String)> = Vec::with_capacity(shas.len());
    for sha in shas {
        let commit = repo
            .revparse_single(sha)
            .and_then(|object| object.peel_to_commit())
            .map_err(|_| AppError::message(format!("找不到提交 {sha}")))?;
        ordered.push((commit.time().seconds(), commit.id().to_string()));
    }
    ordered.sort_by_key(|(time, _)| *time);

    ensure_branch_checked_out(repo_path, target_branch)?;

    let mut args: Vec<String> = vec!["cherry-pick".to_string()];
    args.extend(ordered.iter().map(|(_, sha)| sha.clone()));
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();

    match run_blocking(repo_path, &arg_refs) {
        Ok(_) => Ok(CherryPickResult {
            target_branch: target_branch.to_string(),
            picked: ordered.into_iter().map(|(_, sha)| sha).collect(),
        }),
        Err(error) => {
            let conflicts = conflict_paths(repo_path);
            if conflicts.is_empty() {
                return Err(AppError::CommandFailed(format!(
                    "cherry-pick 到 {target_branch} 失败：{}",
                    command_detail(&error)
                )));
            }
            let list = conflicts
                .iter()
                .take(8)
                .map(|path| format!("· {path}"))
                .collect::<Vec<_>>()
                .join("\n");
            Err(AppError::CherryPickConflict(format!(
                "cherry-pick 到 {target_branch} 时出现冲突：\n{list}\n仓库已停留在 cherry-pick 状态，请手动解决冲突后执行 git cherry-pick --continue（或 --abort）"
            )))
        }
    }
}

pub(crate) fn resolve_remote(repo: &Repository, branch: &str) -> Option<String> {
    if let Ok(local) = repo.find_branch(branch, BranchType::Local) {
        if let Ok(upstream) = local.upstream() {
            if let Ok(Some(name)) = upstream.name() {
                let name = name.trim_start_matches("refs/remotes/");
                if let Some(remote) = name.split('/').next().filter(|value| !value.is_empty()) {
                    return Some(remote.to_string());
                }
            }
            if let Some(remote) = upstream.get().name().and_then(|name| {
                name.trim_start_matches("refs/remotes/")
                    .split('/')
                    .next()
                    .map(str::to_string)
            }) {
                return Some(remote);
            }
        }
    }

    if repo.find_remote("origin").is_ok() {
        return Some("origin".to_string());
    }

    repo.remotes()
        .ok()
        .and_then(|names| names.iter().flatten().next().map(str::to_string))
}

fn upstream_state(
    repo: &Repository,
    branch: &str,
) -> (Option<String>, Option<usize>, Option<usize>) {
    let Ok(local) = repo.find_branch(branch, BranchType::Local) else {
        return (None, None, None);
    };
    let local_oid = local.get().target();

    if let Ok(upstream) = local.upstream() {
        let upstream_name = upstream
            .get()
            .name()
            .map(|name| name.trim_start_matches("refs/remotes/").to_string());
        let ahead_behind = match (local_oid, upstream.get().target()) {
            (Some(local), Some(remote)) => repo.graph_ahead_behind(local, remote).ok(),
            _ => None,
        };
        return match ahead_behind {
            Some((ahead, behind)) => (upstream_name, Some(ahead), Some(behind)),
            None => (upstream_name, None, None),
        };
    }

    // No configured upstream: fall back to the same-name remote branch, which
    // is what `git push` would have created.
    let display = format!("origin/{branch}");
    let Some(local_oid) = local_oid else {
        return (Some(display), None, None);
    };
    let remote_oid = repo
        .remotes()
        .ok()
        .and_then(|remotes| remotes.iter().flatten().next().map(str::to_string))
        .and_then(|remote| {
            repo.refname_to_id(&format!("refs/remotes/{remote}/{branch}"))
                .ok()
        })
        .or_else(|| {
            repo.refname_to_id(&format!("refs/remotes/origin/{branch}"))
                .ok()
        });

    match remote_oid.and_then(|remote| repo.graph_ahead_behind(local_oid, remote).ok()) {
        Some((ahead, behind)) => (Some(display), Some(ahead), Some(behind)),
        None => (Some(display), None, None),
    }
}

/// Commits reachable from `include` but not from `exclude`, newest first.
/// Returns `(listed, total)` — listing stops at `MAX_LISTED_COMMITS` so a huge
/// divergence can not stall the UI.
pub(crate) fn commits_in_range(
    repo: &Repository,
    include: Oid,
    exclude: Option<Oid>,
) -> Result<(Vec<CommitSummary>, usize), AppError> {
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL)?;
    walk.push(include)?;
    if let Some(oid) = exclude.filter(|oid| repo.find_commit(*oid).is_ok()) {
        walk.hide(oid)?;
    }

    let mut listed: Vec<CommitSummary> = Vec::new();
    let mut total = 0usize;
    for oid in walk {
        let Ok(oid) = oid else { continue };
        total += 1;
        if listed.len() >= MAX_LISTED_COMMITS {
            continue;
        }
        if let Ok(commit) = repo.find_commit(oid) {
            listed.push(summarize(&commit));
        }
    }
    Ok((listed, total))
}

/// `refs/remotes/origin/feature/x` → `("origin", "feature/x")`.
pub(crate) fn split_remote_ref(repo: &Repository, ref_name: &str) -> Option<(String, String)> {
    let stripped = ref_name.trim_start_matches("refs/remotes/");
    for remote in remote_names(repo) {
        if let Some(rest) = stripped
            .strip_prefix(remote.as_str())
            .and_then(|rest| rest.strip_prefix('/'))
        {
            return Some((remote, rest.to_string()));
        }
    }
    None
}

fn validate_branch_name(repo: &Repository, name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::BranchInvalid("分支名不能为空".to_string()));
    }
    if name.starts_with('-') {
        return Err(AppError::BranchInvalid(format!("非法的分支名：{name}")));
    }
    let valid = git2::Branch::name_is_valid(name).unwrap_or(false);
    if !valid {
        return Err(AppError::BranchInvalid(format!(
            "「{name}」不是合法的分支名（不能包含空格、..、~、^、:、?、*、[、以 / 或 . 开头结尾等）"
        )));
    }
    if repo.find_branch(name, BranchType::Local).is_ok() {
        return Err(AppError::BranchInvalid(format!("本地分支 {name} 已存在")));
    }
    Ok(())
}

/// Create a local branch from `base_ref` (local or remote-tracking ref) and
/// optionally switch to it. A remote base also becomes the new upstream, so the
/// first push lands on the right branch.
pub fn create_branch(
    repo_path: &Path,
    name: &str,
    base_ref: &str,
    checkout: bool,
) -> Result<CreateBranchResult, AppError> {
    let name = name.trim();
    let repo = open(repo_path)?;
    validate_branch_name(&repo, name)?;

    let oid = resolve_rev(&repo, base_ref)
        .ok_or_else(|| AppError::BranchInvalid(format!("找不到起点分支 {base_ref}")))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|_| AppError::BranchInvalid(format!("起点 {base_ref} 没有可用的提交")))?;

    let mut created = repo.branch(name, &commit, false)?;
    let mut upstream = None;
    if let Some((remote, remote_branch)) = split_remote_ref(&repo, base_ref) {
        let tracking = format!("{remote}/{remote_branch}");
        if created.set_upstream(Some(&tracking)).is_ok() {
            upstream = Some(tracking);
        }
    }

    if checkout {
        ensure_branch_checked_out(repo_path, name).map_err(|error| {
            AppError::CommandFailed(format!(
                "分支 {name} 已创建，但切换到该分支失败：{}\n请先提交或暂存本地改动，再手动切换",
                command_detail(&error)
            ))
        })?;
    }

    Ok(CreateBranchResult {
        branch: name.to_string(),
        ref_name: created
            .get()
            .name()
            .map(str::to_string)
            .unwrap_or_else(|| format!("refs/heads/{name}")),
        base: base_ref.to_string(),
        base_sha: oid.to_string(),
        checked_out: checkout,
        upstream,
    })
}

fn friendly_branch_error(error: &AppError) -> String {
    let detail = command_detail(error);
    if detail.contains("not fully merged") {
        return format!("有未合并的提交，需要勾选「强制删除未合并分支」\n{detail}");
    }
    if detail.contains("checked out at") || detail.contains("used by worktree") {
        return format!("该分支正被工作区使用，无法删除\n{detail}");
    }
    detail
}

/// Where `git push --delete` has to point for this local branch: the upstream's
/// remote + branch name when one is configured (it may differ from the local
/// name), otherwise the same-name branch on the remote `git push` would use.
fn remote_target(repo: &Repository, branch: &str) -> Option<(String, String)> {
    if let Ok(local) = repo.find_branch(branch, BranchType::Local) {
        if let Ok(upstream) = local.upstream() {
            if let Ok(Some(name)) = upstream.name() {
                let rest = name.trim_start_matches("refs/remotes/");
                if let Some((remote, tail)) = rest.split_once('/') {
                    if !remote.is_empty() && !tail.is_empty() {
                        return Some((remote.to_string(), tail.to_string()));
                    }
                }
            }
        }
    }
    let remote = resolve_remote(repo, branch)?;
    Some((remote, branch.to_string()))
}

/// Delete branches, optionally including their remote counterpart.
///
/// `delete_remote` adds `git push <remote> --delete <branch>` after the local ref
/// is gone. The remote comes from the branch upstream, and falls back to `origin`
/// (then to the first configured remote), i.e. the same remote a `git push` of
/// that branch would have used. Branches that were never pushed are not failures.
pub fn delete_branches(
    repo_path: &Path,
    names: &[String],
    force_unmerged: bool,
    delete_remote: bool,
) -> Result<DeleteBranchesResult, AppError> {
    if names.is_empty() {
        return Err(AppError::message("请至少选择一个要删除的分支"));
    }
    let repo = open(repo_path)?;
    let head = super::repo::head_branch(&repo);
    let has_remote = !remote_names(&repo).is_empty();
    // Resolve the remote before the local ref disappears (upstream config lives
    // on the branch itself).
    let targets: Vec<Option<(String, String)>> = names
        .iter()
        .map(|name| remote_target(&repo, name.trim()))
        .collect();

    let mut deleted: Vec<String> = Vec::new();
    let mut failed: Vec<DeleteFailure> = Vec::new();
    let mut remote_deleted: Vec<String> = Vec::new();
    let mut remote_failed: Vec<DeleteFailure> = Vec::new();

    for (index, raw) in names.iter().enumerate() {
        let name = raw.trim();
        if name.is_empty() {
            continue;
        }
        if name.starts_with('-') {
            failed.push(DeleteFailure {
                name: name.to_string(),
                reason: "非法的分支名".to_string(),
            });
            continue;
        }
        if repo.find_branch(name, BranchType::Local).is_err() {
            failed.push(DeleteFailure {
                name: name.to_string(),
                reason: "不是本地分支，已跳过".to_string(),
            });
            continue;
        }
        if head.as_deref() == Some(name) {
            failed.push(DeleteFailure {
                name: name.to_string(),
                reason: "这是当前检出的分支，不能删除".to_string(),
            });
            continue;
        }

        let removed = match run_blocking(repo_path, &["branch", "-d", name]) {
            Ok(_) => true,
            Err(error) => {
                if !force_unmerged {
                    failed.push(DeleteFailure {
                        name: name.to_string(),
                        reason: friendly_branch_error(&error),
                    });
                    continue;
                }
                match run_blocking(repo_path, &["branch", "-D", name]) {
                    Ok(_) => true,
                    Err(force_error) => {
                        failed.push(DeleteFailure {
                            name: name.to_string(),
                            reason: friendly_branch_error(&force_error),
                        });
                        false
                    }
                }
            }
        };
        if !removed {
            continue;
        }
        deleted.push(name.to_string());

        // Only reached when the local ref is gone: deleting the remote while a
        // local copy survives would leave a confusing half-state.
        if !delete_remote || !has_remote {
            continue;
        }
        let Some((remote, remote_branch)) = targets.get(index).cloned().flatten() else {
            continue;
        };
        let label = format!("{remote}/{remote_branch}");
        match delete_remote_branch(repo_path, &remote, &remote_branch) {
            // `false` = the remote never had this branch, nothing to report.
            Ok(false) => {}
            Ok(true) => remote_deleted.push(label),
            Err(detail) => remote_failed.push(DeleteFailure {
                name: label,
                reason: format!("本地分支已删除，但远程分支删除失败：{detail}"),
            }),
        }
    }

    Ok(DeleteBranchesResult {
        deleted,
        failed,
        remote_deleted,
        remote_failed,
    })
}

/// `git push <remote> --delete <branch>`. `Ok(true)` = the ref was removed,
/// `Ok(false)` = the remote never had that branch (a purely local branch), which
/// is not an error.
fn delete_remote_branch(repo_path: &Path, remote: &str, branch: &str) -> Result<bool, String> {
    match run(
        repo_path,
        &["push", remote, "--delete", branch],
        Some(NETWORK_TIMEOUT),
    ) {
        Ok(_) => Ok(true),
        Err(error) => {
            let detail = command_detail(&error);
            let lower = detail.to_ascii_lowercase();
            if lower.contains("remote ref does not exist") || lower.contains("couldn't find remote ref") {
                return Ok(false);
            }
            Err(detail)
        }
    }
}

fn is_non_fast_forward(detail: &str) -> bool {
    let lower = detail.to_ascii_lowercase();
    lower.contains("non-fast-forward")
        || lower.contains("fetch first")
        || (lower.contains("[rejected]") && lower.contains("behind"))
}

/// What a push would do, computed from refs already fetched into the repo (no
/// network). `behind > 0` means the server would reject a normal push.
pub fn push_preview(repo: &Repository, branch: &str) -> Result<PushPreview, AppError> {
    if branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{branch}")));
    }

    let remote = resolve_remote(repo, branch)
        .ok_or_else(|| AppError::message("该仓库没有配置远程地址，无法推送"))?;

    let local_oid = repo
        .find_branch(branch, BranchType::Local)
        .ok()
        .and_then(|branch| branch.get().target())
        .ok_or_else(|| AppError::message(format!("找不到本地分支 {branch}")))?;

    // `git push <remote> <branch>` updates `<remote>/<branch>`, so that is the
    // ref we compare against.
    let remote_oid = repo
        .refname_to_id(&format!("refs/remotes/{remote}/{branch}"))
        .ok();

    let (ahead, behind) = match remote_oid {
        Some(remote_oid) => repo
            .graph_ahead_behind(local_oid, remote_oid)
            .unwrap_or((0, 0)),
        None => (0, 0),
    };

    let (push_commits, _) = commits_in_range(repo, local_oid, remote_oid)?;
    let (remote_only_commits, remote_only_total) = match remote_oid {
        Some(remote_oid) => commits_in_range(repo, remote_oid, Some(local_oid))?,
        None => (Vec::new(), 0),
    };

    let upstream = Some(format!("{remote}/{branch}"));

    Ok(PushPreview {
        branch: branch.to_string(),
        remote,
        upstream,
        remote_exists: remote_oid.is_some(),
        local_sha: Some(local_oid.to_string()),
        remote_sha: remote_oid.map(|oid| oid.to_string()),
        ahead,
        behind,
        push_commits,
        remote_only_commits,
        remote_only_total,
        requires_force: behind > 0,
    })
}

fn upstream_ref_for(repo: &Repository, remote: &str, branch: &str) -> String {
    repo.find_branch(branch, BranchType::Local)
        .ok()
        .and_then(|local| local.upstream().ok())
        .and_then(|upstream| upstream.get().name().map(str::to_string))
        .unwrap_or_else(|| format!("refs/remotes/{remote}/{branch}"))
}

/// Incoming remote commits for the current branch, from refs already fetched
/// into the repo. `fast_forward`/`diverged` decide whether a plain merge is
/// enough or a merge commit is required.
pub fn pull_preview(repo: &Repository, branch: &str) -> Result<PullPreview, AppError> {
    if branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{branch}")));
    }

    let remote = resolve_remote(repo, branch)
        .ok_or_else(|| AppError::message("该仓库没有配置远程地址，无法拉取"))?;
    let local_oid = repo
        .find_branch(branch, BranchType::Local)
        .ok()
        .and_then(|branch| branch.get().target())
        .ok_or_else(|| AppError::message(format!("找不到本地分支 {branch}")))?;

    let upstream_ref = upstream_ref_for(repo, &remote, branch);
    let remote_oid = repo.refname_to_id(&upstream_ref).ok();
    let (ahead, behind) = match remote_oid {
        Some(remote_oid) => repo
            .graph_ahead_behind(local_oid, remote_oid)
            .unwrap_or((0, 0)),
        None => (0, 0),
    };

    let (incoming_commits, incoming_total) = match remote_oid {
        Some(remote_oid) => commits_in_range(repo, remote_oid, Some(local_oid))?,
        None => (Vec::new(), 0),
    };
    let (local_only_commits, local_only_total) = match remote_oid {
        Some(remote_oid) => commits_in_range(repo, local_oid, Some(remote_oid))?,
        None => (Vec::new(), 0),
    };

    Ok(PullPreview {
        branch: branch.to_string(),
        remote,
        upstream: Some(upstream_ref.trim_start_matches("refs/remotes/").to_string()),
        remote_exists: remote_oid.is_some(),
        local_sha: Some(local_oid.to_string()),
        remote_sha: remote_oid.map(|oid| oid.to_string()),
        ahead,
        behind,
        incoming_commits,
        incoming_total,
        local_only_commits,
        local_only_total,
        dirty: super::repo::is_dirty(repo),
        fast_forward: behind > 0 && ahead == 0,
        diverged: behind > 0 && ahead > 0,
        up_to_date: behind == 0,
    })
}

/// `git fetch` then fast-forward (when local has no own commits) or merge. A
/// merge needs explicit consent (`allow_merge`) because it creates a merge
/// commit on top of the user's local commits.
pub fn pull_branch(
    repo_path: &Path,
    branch: &str,
    allow_merge: bool,
    switch_first: bool,
) -> Result<PullResult, AppError> {
    if branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{branch}")));
    }

    let repo = open(repo_path)?;
    let current = super::repo::head_branch(&repo);
    let mut switched = false;
    let mut previous_branch = None;

    if current.as_deref() != Some(branch) {
        if !switch_first {
            return Err(AppError::message(format!(
                "请先切换到分支 {branch} 再拉取远程提交"
            )));
        }
        if repo.find_branch(branch, BranchType::Local).is_err() {
            return Err(AppError::message(format!(
                "找不到本地分支 {branch}，无法拉取"
            )));
        }
        // Checkout carries uncommitted changes along when git allows it; a real
        // conflict aborts here, before anything touches the remote.
        ensure_branch_checked_out(repo_path, branch)?;
        switched = true;
        previous_branch = current;
    }

    let repo = open(repo_path)?;
    let remote = resolve_remote(&repo, branch)
        .ok_or_else(|| AppError::message("该仓库没有配置远程地址，无法拉取"))?;
    let before_sha = repo
        .head()
        .ok()
        .and_then(|head| head.target())
        .map(|oid| oid.to_string());

    // Pulling must look at the remote now, not at a stale tracking ref.
    let fetch = run(
        repo_path,
        &["fetch", remote.as_str(), "--prune"],
        Some(NETWORK_TIMEOUT),
    )
    .map_err(|error| {
        AppError::CommandFailed(format!(
            "拉取前同步 {remote} 失败：{}",
            command_detail(&error)
        ))
    })?;

    // Reopen so the freshly fetched refs are visible.
    let repo = open(repo_path)?;
    let local_oid = repo
        .find_branch(branch, BranchType::Local)
        .ok()
        .and_then(|branch| branch.get().target())
        .ok_or_else(|| AppError::message(format!("找不到本地分支 {branch}")))?;

    let upstream_ref = upstream_ref_for(&repo, &remote, branch);
    let upstream = upstream_ref.trim_start_matches("refs/remotes/").to_string();
    let remote_oid = repo
        .refname_to_id(&upstream_ref)
        .ok()
        .ok_or_else(|| AppError::message(format!("远程还没有分支 {upstream}，无法拉取")))?;
    let (ahead, behind) = repo.graph_ahead_behind(local_oid, remote_oid)?;

    if behind == 0 {
        return Ok(PullResult {
            branch: branch.to_string(),
            remote,
            upstream,
            strategy: "up-to-date".to_string(),
            before_sha: before_sha.clone(),
            after_sha: before_sha,
            incoming: 0,
            output: fetch.display(),
            switched,
            previous_branch: previous_branch.clone(),
        });
    }

    if ahead > 0 && !allow_merge {
        return Err(AppError::message(format!(
            "本地有 {ahead} 个未推送提交，无法快进（fast-forward）拉取；请先推送本地提交，或手动合并"
        )));
    }

    let strategy = if ahead == 0 { "fast-forward" } else { "merge" };
    let mut args: Vec<&str> = vec!["merge", "--no-gpg-sign", "--no-edit"];
    if ahead == 0 {
        args.push("--ff-only");
    }
    args.push(upstream_ref.as_str());

    match run_blocking(repo_path, &args) {
        Ok(output) => {
            let repo = open(repo_path)?;
            let after_sha = repo
                .head()
                .ok()
                .and_then(|head| head.target())
                .map(|oid| oid.to_string());
            let combined = format!("{}\n{}", fetch.display(), output.display());
            Ok(PullResult {
                branch: branch.to_string(),
                remote,
                upstream,
                strategy: strategy.to_string(),
                before_sha,
                after_sha,
                incoming: behind,
                output: combined.trim().to_string(),
                switched,
                previous_branch,
            })
        }
        Err(error) => {
            let conflicts = conflict_paths(repo_path);
            if conflicts.is_empty() {
                return Err(AppError::CommandFailed(format!(
                    "拉取 {upstream} 失败：{}",
                    command_detail(&error)
                )));
            }
            let list = conflicts
                .iter()
                .take(8)
                .map(|path| format!("· {path}"))
                .collect::<Vec<_>>()
                .join("\n");
            Err(AppError::PullConflict(format!(
                "拉取 {upstream} 时出现冲突：\n{list}\n仓库已停留在 merge 状态，请在编辑器里解决冲突后提交，或执行 git merge --abort 放弃本次拉取"
            )))
        }
    }
}

/// `git checkout <branch>` — carries uncommitted changes along when git allows
/// it and refuses (with a readable error) when they would be overwritten.
pub fn checkout_branch(repo_path: &Path, branch: &str) -> Result<CheckoutResult, AppError> {
    let branch = branch.trim();
    if branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{branch}")));
    }

    let repo = open(repo_path)?;
    if repo.find_branch(branch, BranchType::Local).is_err() {
        return Err(AppError::message(format!(
            "找不到本地分支 {branch}（远程分支需要先检出为本地分支）"
        )));
    }

    if super::repo::head_branch(&repo).as_deref() == Some(branch) {
        let commit = repo
            .head()
            .and_then(|head| head.peel_to_commit())
            .map_err(|_| AppError::message("无法读取当前分支的提交"))?;
        return Ok(CheckoutResult {
            branch: branch.to_string(),
            short_sha: short_id(&commit),
            switched: false,
        });
    }

    // Reuses the shared checkout guard: rejects option-like names, passes `--`
    // so a file sharing the branch name is not picked up, and rewrites the
    // failure text into an actionable hint.
    ensure_branch_checked_out(repo_path, branch)?;

    let repo = open(repo_path)?;
    let commit = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| AppError::message("切换后无法读取新的 HEAD"))?;

    Ok(CheckoutResult {
        branch: branch.to_string(),
        short_sha: short_id(&commit),
        switched: true,
    })
}

/// Remote name when `reference` points at a remote-tracking branch
/// (`origin/main` or `refs/remotes/origin/main`), so the base can be fetched
/// before rebasing onto it.
fn remote_of_ref(repo: &Repository, reference: &str) -> Option<String> {
    let normalized = if reference.starts_with("refs/remotes/") {
        reference.to_string()
    } else {
        format!("refs/remotes/{reference}")
    };
    split_remote_ref(repo, &normalized).map(|(remote, _)| remote)
}

pub fn rebase_preview(
    repo: &Repository,
    branch: &str,
    base_ref: &str,
) -> Result<RebasePreview, AppError> {
    if branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{branch}")));
    }
    if base_ref.starts_with('-') {
        return Err(AppError::message(format!("非法的基线：{base_ref}")));
    }

    let tip = branch_tip(repo, branch)?;
    let base_oid = super::repo::resolve_rev(repo, base_ref)
        .ok_or_else(|| AppError::message(format!("找不到基线分支 {base_ref}")))?;

    let already_based = base_oid == tip || repo.merge_base(tip, base_oid).ok() == Some(base_oid);
    let (commits, count) = if already_based {
        (Vec::new(), 0)
    } else {
        commits_in_range(repo, tip, Some(base_oid))?
    };
    let behind_base = if already_based {
        0
    } else {
        commits_in_range(repo, base_oid, Some(tip))?.1
    };

    let (upstream, pushed_tip) = match repo
        .find_branch(branch, BranchType::Local)
        .ok()
        .and_then(|local| local.upstream().ok())
    {
        Some(up) => {
            let name = up
                .get()
                .name()
                .map(|name| name.trim_start_matches("refs/remotes/").to_string());
            let contains_tip = match up.get().target() {
                Some(upstream_oid) => {
                    upstream_oid == tip
                        || repo.graph_descendant_of(upstream_oid, tip).unwrap_or(false)
                }
                None => false,
            };
            (name, contains_tip)
        }
        None => (None, false),
    };

    Ok(RebasePreview {
        branch: branch.to_string(),
        base: base_ref.to_string(),
        base_sha: Some(base_oid.to_string()),
        commits,
        count,
        behind_base,
        upstream,
        dirty: super::repo::is_dirty(repo),
        pushed_tip,
        already_based,
    })
}

/// `git rebase <base>` on `branch` (checked out when needed). History rewriting
/// is never silent: conflicts leave the repo in rebase state and are reported
/// with the file list, and a previously pushed tip sets `needs_force_push`.
pub fn rebase_branch(
    repo_path: &Path,
    branch: &str,
    base_ref: &str,
) -> Result<RebaseResult, AppError> {
    if branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{branch}")));
    }
    if base_ref.starts_with('-') {
        return Err(AppError::message(format!("非法的基线：{base_ref}")));
    }

    let repo = open(repo_path)?;
    if super::repo::resolve_rev(&repo, base_ref).is_none() {
        return Err(AppError::message(format!("找不到基线分支 {base_ref}")));
    }
    ensure_clean_worktree(repo_path)?;

    // Refresh the base first when it lives on a remote, so rebasing happens
    // onto the latest remote commit rather than a stale tracking ref.
    let mut fetch_output = String::new();
    if let Some(remote) = remote_of_ref(&repo, base_ref) {
        let fetched = run(
            repo_path,
            &["fetch", remote.as_str(), "--prune"],
            Some(NETWORK_TIMEOUT),
        )
        .map_err(|error| {
            AppError::CommandFailed(format!(
                "rebase 前同步 {remote} 失败：{}",
                command_detail(&error)
            ))
        })?;
        fetch_output = fetched.display();
    }

    let repo = open(repo_path)?;
    let preview = rebase_preview(&repo, branch, base_ref)?;
    if preview.already_based {
        return Err(AppError::message(format!(
            "{branch} 已经包含 {base_ref} 的全部提交，无需 rebase"
        )));
    }

    let old_head = branch_tip(&repo, branch)?;
    ensure_branch_checked_out(repo_path, branch)?;

    match run_blocking(
        repo_path,
        &["rebase", "--no-gpg-sign", "--no-autostash", base_ref],
    ) {
        Ok(output) => {
            let repo = open(repo_path)?;
            let new_head = repo
                .head()
                .and_then(|head| head.peel_to_commit())
                .map_err(|_| AppError::message("rebase 后无法读取新的提交"))?;
            let combined = format!("{}\n{}", fetch_output, output.display());
            Ok(RebaseResult {
                branch: branch.to_string(),
                base: base_ref.to_string(),
                old_head: Some(old_head.to_string()),
                new_head: short_id(&new_head),
                replayed: preview.count,
                needs_force_push: preview.pushed_tip,
                output: combined.trim().to_string(),
            })
        }
        Err(error) => {
            let conflicts = conflict_paths(repo_path);
            if conflicts.is_empty() {
                return Err(AppError::CommandFailed(format!(
                    "rebase 到 {base_ref} 失败：{}",
                    command_detail(&error)
                )));
            }
            let list = conflicts
                .iter()
                .take(8)
                .map(|path| format!("· {path}"))
                .collect::<Vec<_>>()
                .join("\n");
            Err(AppError::RebaseConflict(format!(
                "rebase 到 {base_ref} 时出现冲突：\n{list}\n仓库已停留在 rebase 状态，请在编辑器里解决冲突后执行 git rebase --continue，或 git rebase --abort 放弃"
            )))
        }
    }
}

pub fn push_branch(repo_path: &Path, branch: &str, force: bool) -> Result<PushResult, AppError> {
    if branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{branch}")));
    }

    let repo = open(repo_path)?;
    let remote = resolve_remote(&repo, branch)
        .ok_or_else(|| AppError::message("该仓库没有配置远程地址，无法推送"))?;

    let mut args = vec!["push".to_string()];
    if force {
        // force-with-lease refuses to clobber someone else's newer commits.
        args.push("--force-with-lease".to_string());
    }
    args.push(remote.clone());
    args.push(branch.to_string());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();

    let output = run(repo_path, &arg_refs, Some(NETWORK_TIMEOUT)).map_err(|error| {
        let detail = command_detail(&error);
        if is_non_fast_forward(&detail) {
            return AppError::PushRejected(format!(
                "远程 {remote}/{branch} 上有本地没有的提交，普通推送被拒绝（non-fast-forward）：\n{detail}"
            ));
        }
        AppError::CommandFailed(format!("推送到 {remote} 失败：{detail}"))
    })?;

    Ok(PushResult {
        branch: branch.to_string(),
        remote,
        forced: force,
        output: output.display(),
    })
}

pub fn sync_branch(repo_path: &Path, branch: &str) -> Result<SyncResult, AppError> {
    if branch.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{branch}")));
    }

    let repo = open(repo_path)?;
    let remote = resolve_remote(&repo, branch)
        .ok_or_else(|| AppError::message("该仓库没有配置远程地址，无法同步"))?;

    let output = run(
        repo_path,
        &["fetch", remote.as_str(), "--prune"],
        Some(NETWORK_TIMEOUT),
    )
    .map_err(|error| {
        AppError::CommandFailed(format!("同步 {remote} 失败：{}", command_detail(&error)))
    })?;

    // Reopen so ahead/behind is computed against the freshly fetched refs.
    let repo = open(repo_path)?;
    let (upstream, ahead, behind) = upstream_state(&repo, branch);

    Ok(SyncResult {
        branch: branch.to_string(),
        remote,
        upstream,
        ahead,
        behind,
        output: output.display(),
    })
}

/// `git fetch --all --prune`: refresh every remote-tracking ref in one shot, then
/// drop refs whose branches disappeared upstream. Nothing in the worktree moves,
/// so this is safe to run with uncommitted changes or in a detached HEAD.
pub fn fetch_all(repo_path: &Path) -> Result<FetchAllResult, AppError> {
    let repo = open(repo_path)?;
    let remotes = remote_names(&repo);
    if remotes.is_empty() {
        return Err(AppError::message(
            "该仓库还没有配置远程地址，无法拉取远程引用",
        ));
    }

    let output = run(
        repo_path,
        &["fetch", "--all", "--prune"],
        Some(NETWORK_TIMEOUT),
    )
    .map_err(|error| {
        AppError::CommandFailed(format!("拉取全部远程引用失败：{}", command_detail(&error)))
    })?;

    Ok(FetchAllResult {
        remotes,
        output: output.display(),
    })
}

/// Commit the index as-is (never `-a`): what the user staged is what gets
/// committed. GPG signing is disabled for the same reason as squash — a signing
/// prompt would block the app because there is no terminal attached.
pub fn commit_staged(repo_path: &Path, message: &str) -> Result<CommitResult, AppError> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::message("提交信息不能为空"));
    }

    let staged = run_blocking(repo_path, &["diff", "--cached", "--name-only"])?;
    let files_changed = staged
        .stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count();
    if files_changed == 0 {
        return Err(AppError::message("暂存区没有改动，请先暂存要提交的文件"));
    }

    let before = open(repo_path)?
        .head()
        .ok()
        .and_then(|head| head.target())
        .map(|oid| oid.to_string());

    run_blocking(repo_path, &["commit", "--no-gpg-sign", "-m", message]).map_err(|error| {
        let detail = command_detail(&error);
        let lower = detail.to_ascii_lowercase();
        if lower.contains("unmerged") || lower.contains("conflict") {
            return AppError::message(format!("还有未解决的冲突，无法提交：\n{detail}"));
        }
        if lower.contains("please tell me who you are")
            || lower.contains("unable to auto-detect email address")
        {
            return AppError::message(format!(
                "git 还没有配置提交者身份，请先执行：\ngit config --global user.name \"你的名字\"\ngit config --global user.email \"you@example.com\"\n{detail}"
            ));
        }
        AppError::CommandFailed(format!("提交失败：{detail}"))
    })?;

    // Reopen so the new HEAD is read from disk (and hooks may have rewritten it).
    let repo = open(repo_path)?;
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| AppError::message("提交后无法读取新的提交"))?;

    if before.as_deref() == Some(&head.id().to_string()) {
        return Err(AppError::message("提交没有产生新记录，请重试"));
    }

    Ok(CommitResult {
        sha: head.id().to_string(),
        short_sha: short_id(&head),
        message: message.to_string(),
        branch: super::repo::head_branch(&repo),
        files_changed,
        needs_force_push: false,
    })
}
