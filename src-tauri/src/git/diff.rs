use git2::{Commit, Delta, Diff, DiffOptions, Patch, Repository, Tree};

use crate::error::AppError;
use crate::model::{FileChange, FileDiff, FileStatus};

/// Hard caps so a huge generated file can not freeze the webview.
///
/// The patch text crosses the IPC boundary as JSON and is then held by the
/// webview as a UTF-16 string, so the cap is deliberately below what a diff
/// viewer could technically handle: a 6k-line window is already far more than
/// anyone scrolls, and it bounds both the transfer and the retained memory.
const MAX_PATCH_BYTES: usize = 800_000;
const MAX_PATCH_LINES: usize = 6_000;

fn base_options(context_lines: u32) -> DiffOptions {
    let mut opts = DiffOptions::new();
    opts.context_lines(context_lines)
        .include_typechange(true)
        .interhunk_lines(0);
    opts
}

fn parent_tree<'a>(commit: &Commit<'a>) -> Result<Option<Tree<'a>>, AppError> {
    match commit.parents().next() {
        Some(parent) => Ok(Some(parent.tree()?)),
        None => Ok(None),
    }
}

fn build_diff<'a>(
    repo: &'a Repository,
    old_tree: Option<&Tree<'_>>,
    new_tree: &Tree<'_>,
    pathspec: Option<&str>,
    context_lines: u32,
) -> Result<Diff<'a>, AppError> {
    let mut opts = base_options(context_lines);
    if let Some(pattern) = pathspec {
        opts.pathspec(pattern);
    }
    Ok(repo.diff_tree_to_tree(old_tree, Some(new_tree), Some(&mut opts))?)
}

/// Diff a commit against its first parent (GitLab semantics for merges), or
/// against the empty tree for the initial commit.
pub fn diff_for_commit<'a>(
    repo: &'a Repository,
    commit: &Commit<'_>,
) -> Result<Diff<'a>, AppError> {
    let tree = commit.tree()?;
    let parent = parent_tree(commit)?;
    build_diff(repo, parent.as_ref(), &tree, None, 3)
}

fn delta_paths(delta: &git2::DiffDelta<'_>) -> (Option<String>, Option<String>) {
    let new_path = delta
        .new_file()
        .path()
        .map(|path| path.to_string_lossy().to_string());
    let old_path = delta
        .old_file()
        .path()
        .map(|path| path.to_string_lossy().to_string());
    (old_path, new_path)
}

fn status_of(delta: &git2::DiffDelta<'_>) -> FileStatus {
    match delta.status() {
        Delta::Added => FileStatus::Added,
        Delta::Untracked => FileStatus::Untracked,
        Delta::Deleted => FileStatus::Deleted,
        Delta::Modified => FileStatus::Modified,
        Delta::Renamed => FileStatus::Renamed,
        Delta::Copied => FileStatus::Copied,
        Delta::Typechange => FileStatus::TypeChange,
        Delta::Conflicted => FileStatus::Conflicted,
        _ => FileStatus::Unknown,
    }
}

fn is_binary(delta: &git2::DiffDelta<'_>) -> bool {
    delta.flags().is_binary()
}

fn patch_line_stats(diff: &Diff<'_>, index: usize) -> (usize, usize) {
    match Patch::from_diff(diff, index) {
        Ok(Some(patch)) => patch
            .line_stats()
            .map(|(_, additions, deletions)| (additions, deletions))
            .unwrap_or((0, 0)),
        _ => (0, 0),
    }
}

pub fn commit_files(repo: &Repository, commit: &Commit<'_>) -> Result<Vec<FileChange>, AppError> {
    let diff = diff_for_commit(repo, commit)?;
    let mut files = Vec::with_capacity(diff.deltas().len());

    for (index, delta) in diff.deltas().enumerate() {
        let (old_path, new_path) = delta_paths(&delta);
        let binary = is_binary(&delta);
        let (additions, deletions) = if binary {
            (0, 0)
        } else {
            patch_line_stats(&diff, index)
        };
        let status = status_of(&delta);
        let path = new_path
            .clone()
            .or_else(|| old_path.clone())
            .unwrap_or_else(|| "(未知路径)".to_string());
        let renamed_from = match status {
            FileStatus::Renamed | FileStatus::Copied => old_path.filter(|old| *old != path),
            _ => None,
        };

        files.push(FileChange {
            path,
            old_path: renamed_from,
            status,
            additions,
            deletions,
            is_binary: binary,
        });
    }

    Ok(files)
}

/// Files changed between two arbitrary trees (branch compare). `base` may be
/// empty for the initial commit comparison.
pub fn ref_files(
    repo: &Repository,
    base: Option<git2::Oid>,
    head: git2::Oid,
) -> Result<Vec<FileChange>, AppError> {
    let head_tree = repo.find_commit(head)?.tree()?;
    let base_tree = match base {
        Some(oid) => Some(repo.find_commit(oid)?.tree()?),
        None => None,
    };
    let diff = build_diff(repo, base_tree.as_ref(), &head_tree, None, 3)?;

    let mut files = Vec::with_capacity(diff.deltas().len());
    for (index, delta) in diff.deltas().enumerate() {
        let (old_path, new_path) = delta_paths(&delta);
        let binary = is_binary(&delta);
        let (additions, deletions) = if binary {
            (0, 0)
        } else {
            patch_line_stats(&diff, index)
        };
        let status = status_of(&delta);
        let path = new_path
            .clone()
            .or_else(|| old_path.clone())
            .unwrap_or_else(|| "(未知路径)".to_string());
        let renamed_from = match status {
            FileStatus::Renamed | FileStatus::Copied => old_path.filter(|old| *old != path),
            _ => None,
        };
        files.push(FileChange {
            path,
            old_path: renamed_from,
            status,
            additions,
            deletions,
            is_binary: binary,
        });
    }
    Ok(files)
}

/// Diff of one path between two arbitrary trees (branch compare).
pub fn ref_file_diff(
    repo: &Repository,
    base: Option<git2::Oid>,
    head: git2::Oid,
    path: &str,
    old_path: Option<&str>,
    context_lines: u32,
) -> Result<FileDiff, AppError> {
    let head_tree = repo.find_commit(head)?.tree()?;
    let base_tree = match base {
        Some(oid) => Some(repo.find_commit(oid)?.tree()?),
        None => None,
    };
    let context_lines = context_lines.clamp(0, 100);
    let match_index = |diff: &Diff<'_>| {
        diff.deltas().position(|delta| {
            let (old, new) = delta_paths(&delta);
            new.as_deref() == Some(path) || old.as_deref() == Some(path)
        })
    };

    let candidates = [Some(path), old_path, None];
    let mut found: Option<(usize, Diff<'_>)> = None;
    for pathspec in candidates {
        let diff = build_diff(
            repo,
            base_tree.as_ref(),
            &head_tree,
            pathspec,
            context_lines,
        )?;
        if let Some(index) = match_index(&diff) {
            found = Some((index, diff));
            break;
        }
    }
    let (index, diff) = found.ok_or_else(|| AppError::FileNotChanged(path.to_string()))?;
    finish_file_diff(&diff, index, path)
}

/// Get the full content of a file at a specific commit.
pub fn get_file_content(
    repo: &Repository,
    sha: &str,
    path: &str,
) -> Result<String, AppError> {
    let oid = git2::Oid::from_str(sha)
        .map_err(|_| AppError::message(format!("无效的提交 SHA: {}", sha)))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|_| AppError::CommitNotFound(sha.to_string()))?;
    let tree = commit.tree()?;
    let entry = tree
        .get_path(std::path::Path::new(path))
        .map_err(|_| AppError::message(format!("文件不存在: {}", path)))?;
    let object = entry.to_object(repo)?;
    let blob = object
        .as_blob()
        .ok_or_else(|| AppError::message(format!("路径不是文件: {}", path)))?;

    // Check if binary
    if blob.is_binary() {
        return Err(AppError::message("二进制文件无法显示文本内容".to_string()));
    }

    let content = String::from_utf8_lossy(blob.content()).into_owned();
    Ok(content)
}

pub fn diff_stats(
    repo: &Repository,
    commit: &Commit<'_>,
) -> Result<(usize, usize, usize), AppError> {
    let diff = diff_for_commit(repo, commit)?;
    let stats = diff.stats()?;
    Ok((stats.files_changed(), stats.insertions(), stats.deletions()))
}

/// Cut an oversized patch in place: no second copy of the (up to 800 KB) text.
fn truncate_patch(mut patch: String) -> (String, bool) {
    if let Some((index, _)) = patch
        .match_indices('\n')
        .nth(MAX_PATCH_LINES.saturating_sub(1))
    {
        if index + 1 < patch.len() {
            patch.truncate(index + 1);
            return (patch, true);
        }
    }

    if patch.len() > MAX_PATCH_BYTES {
        let mut boundary = MAX_PATCH_BYTES;
        while boundary > 0 && !patch.is_char_boundary(boundary) {
            boundary -= 1;
        }
        patch.truncate(boundary);
        return (patch, true);
    }

    (patch, false)
}

fn finish_file_diff(diff: &Diff<'_>, index: usize, path: &str) -> Result<FileDiff, AppError> {
    let delta = diff
        .get_delta(index)
        .ok_or_else(|| AppError::FileNotChanged(path.to_string()))?;
    let (old_delta_path, _) = delta_paths(&delta);
    let binary = is_binary(&delta);

    if binary {
        return Ok(FileDiff {
            path: path.to_string(),
            old_path: old_delta_path.filter(|old| old != path),
            is_binary: true,
            patch: String::new(),
            truncated: false,
            additions: 0,
            deletions: 0,
        });
    }

    let mut patch =
        Patch::from_diff(diff, index)?.ok_or_else(|| AppError::FileNotChanged(path.to_string()))?;
    let (additions, deletions) = patch
        .line_stats()
        .map(|(_, additions, deletions)| (additions, deletions))
        .unwrap_or((0, 0));
    // One copy out of libgit2's buffer, then truncation happens in place.
    let buffer = patch.to_buf()?;
    let (patch, truncated) = truncate_patch(String::from_utf8_lossy(&buffer).into_owned());

    Ok(FileDiff {
        path: path.to_string(),
        old_path: old_delta_path.filter(|old| old != path),
        is_binary: false,
        patch,
        truncated,
        additions,
        deletions,
    })
}

pub fn file_diff(
    repo: &Repository,
    commit: &Commit<'_>,
    path: &str,
    old_path: Option<&str>,
    context_lines: u32,
) -> Result<FileDiff, AppError> {
    let tree = commit.tree()?;
    let parent = parent_tree(commit)?;
    let context_lines = context_lines.clamp(0, 100);

    let match_index = |diff: &Diff<'_>| {
        diff.deltas().position(|delta| {
            let (old, new) = delta_paths(&delta);
            new.as_deref() == Some(path) || old.as_deref() == Some(path)
        })
    };

    let candidates = [Some(path), old_path, None];
    let mut found: Option<(usize, Diff<'_>)> = None;
    for pathspec in candidates {
        let diff = build_diff(repo, parent.as_ref(), &tree, pathspec, context_lines)?;
        if let Some(index) = match_index(&diff) {
            found = Some((index, diff));
            break;
        }
    }

    let (index, diff) = found.ok_or_else(|| AppError::FileNotChanged(path.to_string()))?;
    finish_file_diff(&diff, index, path)
}

fn build_worktree_diff<'a>(
    repo: &'a Repository,
    head_tree: Option<&Tree<'_>>,
    pathspec: Option<&str>,
    context_lines: u32,
    staged: bool,
) -> Result<Diff<'a>, AppError> {
    let mut options = base_options(context_lines);
    if let Some(pattern) = pathspec {
        options.pathspec(pattern);
    }
    if !staged {
        options.include_untracked(true).show_untracked_content(true);
    }

    if staged {
        Ok(repo.diff_tree_to_index(head_tree, None, Some(&mut options))?)
    } else {
        Ok(repo.diff_index_to_workdir(None, Some(&mut options))?)
    }
}

/// Diff for one path in the worktree: `staged` compares the index against HEAD,
/// otherwise the working directory against the index (untracked files are shown
/// as full additions).
pub fn worktree_file_diff(
    repo: &Repository,
    path: &str,
    staged: bool,
    context_lines: u32,
) -> Result<FileDiff, AppError> {
    let context_lines = context_lines.clamp(0, 100);
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());

    let match_index = |diff: &Diff<'_>| {
        diff.deltas().position(|delta| {
            let (old, new) = delta_paths(&delta);
            new.as_deref() == Some(path) || old.as_deref() == Some(path)
        })
    };

    let mut found: Option<(usize, Diff<'_>)> = None;
    for pathspec in [Some(path), None] {
        let diff = build_worktree_diff(repo, head_tree.as_ref(), pathspec, context_lines, staged)?;
        if let Some(index) = match_index(&diff) {
            found = Some((index, diff));
            break;
        }
    }

    let (index, diff) = found.ok_or_else(|| AppError::FileNotChanged(path.to_string()))?;
    finish_file_diff(&diff, index, path)
}

