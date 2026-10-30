use std::fs;
use std::path::{Path, PathBuf};

use git2::{BranchType, Oid, Repository};

use crate::error::AppError;
use crate::model::{
    CommitResult, ComparePreview, DeleteTagResult, HeadCommitPreview, MergePreview, MergeResult,
    ReflogEntry, RepoOperationState, ResetResult, StashEntry, StashList, TagInfo,
};

use super::cli::{NETWORK_TIMEOUT, run, run_blocking};
use super::diff;
use super::ops::{commits_in_range, conflict_paths, resolve_remote, split_remote_ref};
use super::repo::{head_branch, is_dirty, open_repo, resolve_rev, short_id};

const MAX_RELOG: usize = 24;

fn open(path: &Path) -> Result<Repository, AppError> {
    open_repo(&path.display().to_string())
}

fn command_detail(error: &AppError) -> String {
    match error {
        AppError::CommandFailed(detail) => detail.clone(),
        other => other.to_string(),
    }
}

fn conflict_list(paths: &[String]) -> String {
    paths
        .iter()
        .take(8)
        .map(|path| format!("· {path}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn git_dir(repo: &Repository) -> &Path {
    repo.path()
}

fn read_counter(path: PathBuf) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
}

/// Detect a merge / rebase / cherry-pick / revert that stopped mid-way.
pub fn repo_state(repo: &Repository) -> RepoOperationState {
    let dir = git_dir(repo);
    let path = dir.display().to_string();
    let conflicts = conflict_paths(Path::new(&path));

    let rebase_merge = dir.join("rebase-merge");
    let rebase_apply = dir.join("rebase-apply");
    if rebase_merge.exists() || rebase_apply.exists() {
        let step_dir = if rebase_merge.exists() {
            rebase_merge
        } else {
            rebase_apply
        };
        let current = read_counter(step_dir.join("msgnum"));
        let total = read_counter(step_dir.join("end"));
        let detail = match (current, total) {
            (Some(current), Some(total)) => Some(format!("rebase {current}/{total}")),
            _ => Some("rebase 进行中".to_string()),
        };
        return RepoOperationState {
            kind: "rebase".to_string(),
            conflicts,
            can_skip: true,
            detail,
        };
    }

    if dir.join("MERGE_HEAD").exists() {
        return RepoOperationState {
            kind: "merge".to_string(),
            conflicts,
            can_skip: false,
            detail: None,
        };
    }
    if dir.join("CHERRY_PICK_HEAD").exists() {
        return RepoOperationState {
            kind: "cherry-pick".to_string(),
            conflicts,
            can_skip: true,
            detail: None,
        };
    }
    if dir.join("REVERT_HEAD").exists() {
        return RepoOperationState {
            kind: "revert".to_string(),
            conflicts,
            can_skip: true,
            detail: None,
        };
    }

    RepoOperationState {
        kind: "none".to_string(),
        conflicts,
        can_skip: false,
        detail: None,
    }
}

fn operation_error(kind: &str, detail: &str, conflicts: &[String]) -> AppError {
    if conflicts.is_empty() {
        return AppError::CommandFailed(detail.to_string());
    }
    let list = conflict_list(conflicts);
    match kind {
        "merge" => AppError::MergeConflict(format!(
            "merge 仍有冲突：\n{list}\n解决冲突并暂存后点「继续」，或点「中止」放弃本次 merge"
        )),
        "rebase" => AppError::RebaseConflict(format!(
            "rebase 仍有冲突：\n{list}\n解决后点「继续」，或点「中止」放弃本次 rebase"
        )),
        "cherry-pick" => AppError::CherryPickConflict(format!(
            "cherry-pick 仍有冲突：\n{list}\n解决后点「继续」，或点「中止」放弃"
        )),
        "revert" => AppError::RevertConflict(format!(
            "revert 仍有冲突：\n{list}\n解决后点「继续」，或点「中止」放弃"
        )),
        _ => AppError::CommandFailed(detail.to_string()),
    }
}

/// `continue` / `skip` / `abort` for whatever operation is in progress.
pub fn operation_action(repo_path: &Path, action: &str) -> Result<RepoOperationState, AppError> {
    let repo = open(repo_path)?;
    let state = repo_state(&repo);
    if state.kind == "none" {
        return Err(AppError::message(
            "当前没有进行中的 merge / rebase / cherry-pick / revert",
        ));
    }

    let kind = state.kind.clone();
    let mut args: Vec<&str> = vec!["-c", "core.editor=true", kind.as_str()];
    match action {
        "continue" => args.push("--continue"),
        "skip" => {
            if !state.can_skip {
                return Err(AppError::message(
                    "merge 进行中不能跳过，请解决冲突后继续或中止",
                ));
            }
            args.push("--skip");
        }
        "abort" => args.push("--abort"),
        other => {
            return Err(AppError::message(format!("不支持的操作：{other}")));
        }
    }

    // A merge is concluded with a plain commit; the other operations have their
    // own `--continue` implementations.
    let result = if kind == "merge" && action == "continue" {
        run_blocking(repo_path, &["commit", "--no-edit", "--no-gpg-sign"])
    } else {
        run_blocking(repo_path, &args)
    };

    let repo = open(repo_path)?;
    match result {
        Ok(_) => Ok(repo_state(&repo)),
        Err(error) => {
            let after = repo_state(&repo);
            if !after.conflicts.is_empty() {
                Err(operation_error(
                    &kind,
                    &command_detail(&error),
                    &after.conflicts,
                ))
            } else {
                Err(AppError::CommandFailed(format!(
                    "{kind} {action} 失败：{}",
                    command_detail(&error)
                )))
            }
        }
    }
}

// --- stash -----------------------------------------------------------------

fn clean_stash_message(raw: &str) -> String {
    let wip = raw.starts_with("WIP on ");
    let stripped = raw.strip_prefix("WIP on ").or_else(|| raw.strip_prefix("On "));
    let Some(rest) = stripped else {
        return raw.to_string();
    };
    let Some((_, tail)) = rest.split_once(": ") else {
        return raw.to_string();
    };
    // WIP stashes are "WIP on <branch>: <short sha> <subject>".
    let tail = if wip {
        tail.split_once(' ').map(|(_, subject)| subject).unwrap_or(tail)
    } else {
        tail
    };
    tail.trim().to_string()
}

pub fn stash_list(repo_path: &Path) -> Result<StashList, AppError> {
    let output = run_blocking(repo_path, &["stash", "list", "--format=%gd%x09%gs"])?;
    let entries = output
        .stdout
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let mut parts = line.splitn(2, '\t');
            let selector = parts.next()?.trim().to_string();
            if selector.is_empty() {
                return None;
            }
            let message = clean_stash_message(parts.next().unwrap_or("").trim());
            Some(StashEntry {
                selector,
                index,
                message,
            })
        })
        .collect();
    Ok(StashList { entries })
}

pub fn stash_push(
    repo_path: &Path,
    message: &str,
    include_untracked: bool,
) -> Result<StashList, AppError> {
    let message = message.trim();
    let mut args: Vec<&str> = vec!["stash", "push"];
    if include_untracked {
        args.push("-u");
    }
    if !message.is_empty() {
        args.push("-m");
        args.push(message);
    }

    run_blocking(repo_path, &args).map_err(|error| {
        AppError::CommandFailed(format!("暂存改动失败：{}", command_detail(&error)))
    })?;
    stash_list(repo_path)
}

pub fn stash_pop(repo_path: &Path, index: usize) -> Result<StashList, AppError> {
    let selector = format!("stash@{{{index}}}");
    run_blocking(repo_path, &["stash", "pop", selector.as_str()]).map_err(|error| {
        let repo = open(repo_path).ok();
        let conflicts = repo
            .as_ref()
            .map(|repo| conflict_paths(Path::new(&repo.path().display().to_string())))
            .unwrap_or_default();
        if conflicts.is_empty() {
            AppError::CommandFailed(format!("恢复暂存失败：{}", command_detail(&error)))
        } else {
            AppError::StashConflict(format!(
                "恢复 {selector} 时出现冲突：\n{}\n请解决冲突后暂存；该 stash 仍保留在列表里",
                conflict_list(&conflicts)
            ))
        }
    })?;
    stash_list(repo_path)
}

pub fn stash_drop(repo_path: &Path, index: usize) -> Result<StashList, AppError> {
    let selector = format!("stash@{{{index}}}");
    run_blocking(repo_path, &["stash", "drop", selector.as_str()]).map_err(|error| {
        AppError::CommandFailed(format!("删除 {selector} 失败：{}", command_detail(&error)))
    })?;
    stash_list(repo_path)
}

// --- amend -----------------------------------------------------------------

fn upstream_contains(repo: &Repository, oid: Oid) -> bool {
    let Ok(head) = repo.head() else {
        return false;
    };
    let Some(shorthand) = head.shorthand() else {
        return false;
    };
    let Ok(local) = repo.find_branch(shorthand, BranchType::Local) else {
        return false;
    };
    let Ok(upstream) = local.upstream() else {
        return false;
    };
    match upstream.get().target() {
        Some(upstream_oid) => {
            upstream_oid == oid || repo.graph_descendant_of(upstream_oid, oid).unwrap_or(false)
        }
        None => false,
    }
}

pub fn head_commit_preview(repo: &Repository) -> Result<HeadCommitPreview, AppError> {
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| AppError::message("仓库还没有任何提交，无法修正提交"))?;
    let (files_changed, _, _) = diff::diff_stats(repo, &head)?;
    Ok(HeadCommitPreview {
        sha: head.id().to_string(),
        short_sha: short_id(&head),
        message: head.message().unwrap_or_default().trim_end().to_string(),
        files_changed,
        pushed: upstream_contains(repo, head.id()),
    })
}

/// `git commit --amend`: replaces HEAD with a new commit (staged changes are
/// included, the tree is otherwise unchanged).
pub fn amend_commit(repo_path: &Path, message: &str) -> Result<CommitResult, AppError> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::message("提交信息不能为空"));
    }

    let repo = open(repo_path)?;
    let old = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| AppError::message("仓库还没有任何提交，无法修正提交"))?;
    let pushed = upstream_contains(&repo, old.id());
    let files_changed = {
        let staged = run_blocking(repo_path, &["diff", "--cached", "--name-only"])?;
        let staged_count = staged
            .stdout
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count();
        if staged_count > 0 {
            staged_count
        } else {
            diff::diff_stats(&repo, &old)?.0
        }
    };

    run_blocking(
        repo_path,
        &["commit", "--amend", "--no-gpg-sign", "-m", message],
    )
    .map_err(|error| {
        let detail = command_detail(&error);
        if detail.to_ascii_lowercase().contains("unmerged") {
            return AppError::message(format!("还有未解决的冲突，无法修正提交：\n{detail}"));
        }
        AppError::CommandFailed(format!("修正提交失败：{detail}"))
    })?;

    let repo = open(repo_path)?;
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| AppError::message("修正后无法读取新的提交"))?;

    Ok(CommitResult {
        sha: head.id().to_string(),
        short_sha: short_id(&head),
        message: message.to_string(),
        branch: head_branch(&repo),
        files_changed,
        needs_force_push: pushed,
    })
}

// --- ignore ----------------------------------------------------------------

/// Append one path to `.gitignore` (idempotent). Ignoring is local-only: the
/// file is never staged or committed here.
pub fn ignore_path(repo_path: &Path, path: &str, is_dir: bool) -> Result<(), AppError> {
    let path = path.trim().trim_start_matches('/');
    if path.is_empty() || path.contains("..") || path.starts_with('-') {
        return Err(AppError::message(format!("非法的路径：{path}")));
    }

    let repo = open(repo_path)?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::message("该仓库没有工作区"))?;
    let file = workdir.join(".gitignore");
    let entry = if is_dir {
        format!("/{}/", path.trim_end_matches('/'))
    } else {
        format!("/{path}")
    };

    let mut content = fs::read_to_string(&file).unwrap_or_default();
    if content.lines().any(|line| line.trim() == entry) {
        return Ok(());
    }
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(&entry);
    content.push('\n');
    fs::write(&file, content)?;
    Ok(())
}

// --- merge -----------------------------------------------------------------

pub fn merge_preview(repo: &Repository, source: &str) -> Result<MergePreview, AppError> {
    if source.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{source}")));
    }
    let source_oid = resolve_rev(repo, source)
        .ok_or_else(|| AppError::message(format!("找不到分支 {source}")))?;
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| AppError::message("仓库还没有任何提交，无法合并"))?;

    let (commits, count) = commits_in_range(repo, source_oid, Some(head.id()))?;
    let can_fast_forward = repo
        .merge_base(head.id(), source_oid)
        .map(|base| base == head.id())
        .unwrap_or(false);

    Ok(MergePreview {
        source: source.to_string(),
        source_sha: source_oid.to_string(),
        commits,
        count,
        can_fast_forward,
        dirty: is_dirty(repo),
    })
}

pub fn merge_branch(repo_path: &Path, source: &str, no_ff: bool) -> Result<MergeResult, AppError> {
    if source.starts_with('-') {
        return Err(AppError::message(format!("非法的分支名：{source}")));
    }
    let repo = open(repo_path)?;
    if head_branch(&repo).is_none() {
        return Err(AppError::message("当前不在任何分支上，无法合并"));
    }
    let preview = merge_preview(&repo, source)?;

    // Refresh a remote source before merging it.
    if let Some(remote) = split_remote_ref(&repo, source).map(|(remote, _)| remote) {
        run(
            repo_path,
            &["fetch", remote.as_str(), "--prune"],
            Some(NETWORK_TIMEOUT),
        )
        .map_err(|error| {
            AppError::CommandFailed(format!(
                "合并前同步 {remote} 失败：{}",
                command_detail(&error)
            ))
        })?;
    }

    let mut args: Vec<&str> = vec!["merge", "--no-gpg-sign", "--no-edit"];
    if no_ff {
        args.push("--no-ff");
    }
    args.push(source);

    match run_blocking(repo_path, &args) {
        Ok(output) => {
            let strategy = if preview.count == 0 {
                "up-to-date"
            } else if output
                .display()
                .to_ascii_lowercase()
                .contains("fast-forward")
                && !no_ff
            {
                "fast-forward"
            } else {
                "merge"
            };
            let repo = open(repo_path)?;
            let head = repo
                .head()
                .and_then(|head| head.peel_to_commit())
                .map_err(|_| AppError::message("合并后无法读取新的提交"))?;
            Ok(MergeResult {
                source: source.to_string(),
                strategy: strategy.to_string(),
                commits: preview.count,
                short_sha: short_id(&head),
            })
        }
        Err(error) => {
            let conflicts = conflict_paths(repo_path);
            if conflicts.is_empty() {
                return Err(AppError::CommandFailed(format!(
                    "合并 {source} 失败：{}",
                    command_detail(&error)
                )));
            }
            Err(AppError::MergeConflict(format!(
                "合并 {source} 时出现冲突：\n{}\n仓库已停留在 merge 状态，请解决冲突并暂存后提交，或执行 git merge --abort 放弃",
                conflict_list(&conflicts)
            )))
        }
    }
}

// --- revert ----------------------------------------------------------------

pub fn revert_commit(repo_path: &Path, sha: &str) -> Result<CommitResult, AppError> {
    if sha.starts_with('-') {
        return Err(AppError::message(format!("非法的提交：{sha}")));
    }
    let repo = open(repo_path)?;
    let oid = resolve_rev(&repo, sha).ok_or_else(|| AppError::CommitNotFound(sha.to_string()))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|_| AppError::CommitNotFound(sha.to_string()))?;

    run_blocking(
        repo_path,
        &["revert", "--no-edit", "--no-gpg-sign", oid.to_string().as_str()],
    )
    .map_err(|error| {
        let conflicts = conflict_paths(repo_path);
        if conflicts.is_empty() {
            return AppError::CommandFailed(format!(
                "撤销提交失败：{}",
                command_detail(&error)
            ));
        }
        AppError::RevertConflict(format!(
            "撤销 {} 时出现冲突：\n{}\n仓库已停留在 revert 状态，请解决后执行 git revert --continue（或 --abort）",
            short_id(&commit),
            conflict_list(&conflicts)
        ))
    })?;

    let repo = open(repo_path)?;
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| AppError::message("撤销后无法读取新的提交"))?;
    Ok(CommitResult {
        sha: head.id().to_string(),
        short_sha: short_id(&head),
        message: head.message().unwrap_or_default().trim_end().to_string(),
        branch: head_branch(&repo),
        files_changed: 1,
        needs_force_push: false,
    })
}

// --- tags ------------------------------------------------------------------

pub fn list_tags(repo: &Repository) -> Result<Vec<TagInfo>, AppError> {
    let names = repo.tag_names(None)?;
    let mut tags = Vec::new();

    for name in names.iter().flatten() {
        let refname = format!("refs/tags/{name}");
        let Ok(reference) = repo.find_reference(&refname) else {
            continue;
        };
        let Ok(object) = reference.peel(git2::ObjectType::Any) else {
            continue;
        };
        let annotated = object.kind() == Some(git2::ObjectType::Tag);
        let (message, created_at) = if annotated {
            match object.into_tag() {
                Ok(tag) => (
                    tag.message().map(|value| value.trim().to_string()),
                    tag.tagger().map(|signature| signature.when().seconds()),
                ),
                Err(_) => (None, None),
            }
        } else {
            (None, None)
        };

        let commit = reference
            .peel_to_commit()
            .map_err(|_| AppError::message(format!("标签 {name} 无法解析到提交")))?;

        tags.push(TagInfo {
            name: name.to_string(),
            sha: commit.id().to_string(),
            short_sha: short_id(&commit),
            annotated,
            message,
            created_at,
            target: None,
        });
    }

    tags.sort_by(|a, b| {
        b.created_at
            .unwrap_or(0)
            .cmp(&a.created_at.unwrap_or(0))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(tags)
}

fn validate_tag_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::RemoteInvalid("标签名不能为空".to_string()));
    }
    if name.starts_with('-') || name.chars().any(|ch| ch.is_whitespace() || ch.is_control()) {
        return Err(AppError::RemoteInvalid(format!("非法的标签名：{name}")));
    }
    Ok(())
}

pub fn create_tag(
    repo_path: &Path,
    name: &str,
    target: &str,
    message: &str,
) -> Result<Vec<TagInfo>, AppError> {
    let name = name.trim();
    let target = target.trim();
    let message = message.trim();
    validate_tag_name(name)?;
    if target.is_empty() {
        return Err(AppError::RemoteInvalid("标签目标不能为空".to_string()));
    }

    let mut args: Vec<&str> = vec!["-c", "tag.gpgSign=false", "tag"];
    if !message.is_empty() {
        args.push("-a");
        args.push(name);
        args.push("-m");
        args.push(message);
    } else {
        args.push(name);
    }
    args.push(target);

    run_blocking(repo_path, &args).map_err(|error| {
        AppError::RemoteInvalid(format!(
            "创建标签 {name} 失败：\n{}",
            command_detail(&error)
        ))
    })?;

    let repo = open(repo_path)?;
    list_tags(&repo)
}

/// Delete a tag locally and — when asked — the same tag on `origin`.
///
/// The local deletion always runs first: a missing remote must not leave the tag
/// in place locally. The remote outcome is reported separately so the UI can say
/// "本地已删除，远程没删掉" instead of pretending nothing happened.
pub fn delete_tag(
    repo_path: &Path,
    name: &str,
    delete_remote: bool,
) -> Result<DeleteTagResult, AppError> {
    validate_tag_name(name)?;
    run_blocking(repo_path, &["tag", "-d", name]).map_err(|error| {
        AppError::CommandFailed(format!("删除标签 {name} 失败：{}", command_detail(&error)))
    })?;

    let mut remote_deleted = false;
    let mut remote_failure: Option<String> = None;
    if delete_remote {
        let repo = open(repo_path)?;
        if repo.find_remote("origin").is_err() {
            remote_failure = Some("该仓库没有 origin 远程，只删除了本地标签".to_string());
        } else {
            let refspec = format!("refs/tags/{name}");
            match run(
                repo_path,
                &["push", "origin", "--delete", refspec.as_str()],
                Some(NETWORK_TIMEOUT),
            ) {
                Ok(_) => remote_deleted = true,
                Err(error) => {
                    let detail = command_detail(&error);
                    let lower = detail.to_ascii_lowercase();
                    // origin never had this tag: nothing to delete, not an error.
                    if !(lower.contains("remote ref does not exist")
                        || lower.contains("couldn't find remote ref"))
                    {
                        remote_failure = Some(detail);
                    }
                }
            }
        }
    }

    let repo = open(repo_path)?;
    Ok(DeleteTagResult {
        tags: list_tags(&repo)?,
        remote_deleted,
        remote_failure,
    })
}

pub fn push_tag(repo_path: &Path, name: &str) -> Result<String, AppError> {
    validate_tag_name(name)?;
    let repo = open(repo_path)?;
    let remote = head_branch(&repo)
        .and_then(|branch| resolve_remote(&repo, &branch))
        .or_else(|| {
            repo.remotes()
                .ok()
                .and_then(|names| names.iter().flatten().next().map(str::to_string))
        })
        .ok_or_else(|| AppError::message("该仓库没有配置远程地址，无法推送标签"))?;

    let refspec = format!("refs/tags/{name}");
    run(
        repo_path,
        &["push", remote.as_str(), refspec.as_str()],
        Some(NETWORK_TIMEOUT),
    )
    .map_err(|error| {
        AppError::CommandFailed(format!(
            "推送标签 {name} 到 {remote} 失败：{}",
            command_detail(&error)
        ))
    })?;
    Ok(remote)
}

// --- reflog / undo ---------------------------------------------------------

pub fn reflog_entries(repo: &Repository, limit: usize) -> Result<Vec<ReflogEntry>, AppError> {
    let reflog = repo
        .reflog("HEAD")
        .map_err(|_| AppError::message("无法读取 reflog（仓库可能还没有提交）"))?;
    let limit = limit.clamp(1, MAX_RELOG);

    let mut entries = Vec::new();
    for (index, entry) in reflog.iter().enumerate().take(limit) {
        let sha = entry.id_new();
        let Ok(commit) = repo.find_commit(sha) else {
            continue;
        };
        let raw = entry.message().unwrap_or("").to_string();
        let (action, message) = match raw.split_once(':') {
            Some((action, rest)) => (action.trim().to_string(), rest.trim().to_string()),
            None => (raw.clone(), String::new()),
        };
        entries.push(ReflogEntry {
            index,
            sha: sha.to_string(),
            short_sha: short_id(&commit),
            action,
            message,
            when: entry.committer().when().seconds(),
        });
    }
    Ok(entries)
}

/// Move the current branch to `sha`. `mixed` keeps the worktree (changes become
/// uncommitted), `hard` discards them — the UI asks before using `hard`.
pub fn reset_to(repo_path: &Path, sha: &str, hard: bool) -> Result<ResetResult, AppError> {
    if sha.starts_with('-') {
        return Err(AppError::message(format!("非法的提交：{sha}")));
    }
    let repo = open(repo_path)?;
    let oid = resolve_rev(&repo, sha).ok_or_else(|| AppError::CommitNotFound(sha.to_string()))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|_| AppError::CommitNotFound(sha.to_string()))?;
    let mode = if hard { "hard" } else { "mixed" };

    run_blocking(
        repo_path,
        &["reset", &format!("--{mode}"), oid.to_string().as_str()],
    )
    .map_err(|error| {
        AppError::CommandFailed(format!(
            "重置到 {} 失败：{}",
            short_id(&commit),
            command_detail(&error)
        ))
    })?;

    let repo = open(repo_path)?;
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| AppError::message("重置后无法读取 HEAD"))?;
    Ok(ResetResult {
        sha: head.id().to_string(),
        short_sha: short_id(&head),
        mode: mode.to_string(),
    })
}

// --- branch compare --------------------------------------------------------

pub fn compare_refs(repo: &Repository, base: &str, head: &str) -> Result<ComparePreview, AppError> {
    let base_oid =
        resolve_rev(repo, base).ok_or_else(|| AppError::message(format!("找不到基线 {base}")))?;
    let head_oid = resolve_rev(repo, head)
        .ok_or_else(|| AppError::message(format!("找不到对比分支 {head}")))?;

    let (commits, commit_count) = if base_oid == head_oid {
        (Vec::new(), 0)
    } else {
        commits_in_range(repo, head_oid, Some(base_oid))?
    };

    let files = diff::ref_files(repo, Some(base_oid), head_oid)?;
    let additions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();

    Ok(ComparePreview {
        base: base.to_string(),
        head: head.to_string(),
        commits,
        commit_count,
        files,
        additions,
        deletions,
    })
}
