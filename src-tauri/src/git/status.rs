use std::path::Path;

use git2::{Repository, Status, StatusOptions};

use crate::error::AppError;
use crate::model::{FileStatus, WorktreeEntry, WorktreeStatus};

use super::repo::head_branch;

fn index_status(flags: Status) -> Option<FileStatus> {
    if flags.is_index_new() {
        Some(FileStatus::Added)
    } else if flags.is_index_modified() {
        Some(FileStatus::Modified)
    } else if flags.is_index_deleted() {
        Some(FileStatus::Deleted)
    } else if flags.is_index_renamed() {
        Some(FileStatus::Renamed)
    } else if flags.is_index_typechange() {
        Some(FileStatus::TypeChange)
    } else {
        None
    }
}

fn worktree_status_of(flags: Status) -> Option<FileStatus> {
    if flags.is_wt_new() {
        Some(FileStatus::Untracked)
    } else if flags.is_wt_modified() {
        Some(FileStatus::Modified)
    } else if flags.is_wt_deleted() {
        Some(FileStatus::Deleted)
    } else if flags.is_wt_renamed() {
        Some(FileStatus::Renamed)
    } else if flags.is_wt_typechange() {
        Some(FileStatus::TypeChange)
    } else {
        None
    }
}

fn read_status(repo: &Repository) -> Result<Vec<WorktreeEntry>, AppError> {
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .exclude_submodules(true);

    let statuses = repo.statuses(Some(&mut options))?;
    let mut entries = Vec::with_capacity(statuses.len());

    for entry in statuses.iter() {
        let flags = entry.status();
        if flags == Status::CURRENT {
            continue;
        }
        let Some(path) = entry.path().map(str::to_string) else {
            continue;
        };

        let conflicted = flags.is_conflicted();
        let mut staged = index_status(flags);
        let mut unstaged = worktree_status_of(flags);
        if conflicted {
            staged = Some(FileStatus::Conflicted);
            unstaged = Some(FileStatus::Conflicted);
        }

        let old_path = entry
            .head_to_index()
            .and_then(|delta| {
                delta
                    .old_file()
                    .path()
                    .map(|path| path.to_string_lossy().to_string())
            })
            .filter(|old| *old != path);

        if staged.is_none() && unstaged.is_none() {
            continue;
        }

        entries.push(WorktreeEntry {
            path,
            old_path,
            staged,
            unstaged,
            conflicted,
        });
    }

    entries.sort_by(|a, b| {
        b.conflicted
            .cmp(&a.conflicted)
            .then_with(|| a.path.cmp(&b.path))
    });

    Ok(entries)
}

pub fn worktree_status(repo: &Repository) -> Result<WorktreeStatus, AppError> {
    let entries = read_status(repo)?;
    let staged_count = entries
        .iter()
        .filter(|entry| entry.staged.is_some())
        .count();
    let unstaged_count = entries
        .iter()
        .filter(|entry| entry.unstaged.is_some())
        .count();
    let conflicted_count = entries.iter().filter(|entry| entry.conflicted).count();

    Ok(WorktreeStatus {
        head_branch: head_branch(repo),
        entries,
        staged_count,
        unstaged_count,
        conflicted_count,
    })
}

fn head_object(repo: &Repository) -> Result<git2::Object<'_>, AppError> {
    let head = repo
        .head()
        .map_err(|_| AppError::message("仓库还没有任何提交，无法执行该操作"))?;
    Ok(head.peel(git2::ObjectType::Any)?)
}

pub fn stage_file(repo: &Repository, path: &str) -> Result<(), AppError> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::message("该仓库没有工作区"))?;
    let mut index = repo.index()?;
    let relative = Path::new(path);
    if workdir.join(relative).exists() {
        index.add_path(relative)?;
    } else {
        index.remove_path(relative)?;
    }
    index.write()?;
    Ok(())
}

pub fn unstage_file(repo: &Repository, path: &str) -> Result<(), AppError> {
    let relative = Path::new(path);
    match head_object(repo) {
        Ok(target) => {
            repo.reset_default(Some(&target), [relative])?;
        }
        Err(_) => {
            let mut index = repo.index()?;
            index.remove_path(relative)?;
            index.write()?;
        }
    }
    Ok(())
}

/// Restore one path to its committed state. Files that do not exist in HEAD
/// are removed from the index and deleted from disk (VS Code semantics).
pub fn discard_file(repo: &Repository, path: &str) -> Result<(), AppError> {
    let relative = Path::new(path);
    let tracked_in_head = repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_tree().ok())
        .map(|tree| tree.get_path(relative).is_ok())
        .unwrap_or(false);

    if tracked_in_head {
        let target = head_object(repo)?;
        repo.reset_default(Some(&target), [relative])?;
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force();
        checkout.path(relative);
        repo.checkout_index(None, Some(&mut checkout))?;
        return Ok(());
    }

    // New file: drop it from the index, then delete it from the worktree.
    if let Ok(mut index) = repo.index() {
        let _ = index.remove_path(relative);
        let _ = index.write();
    }
    if let Some(workdir) = repo.workdir() {
        let absolute = workdir.join(relative);
        if absolute.is_file() {
            std::fs::remove_file(&absolute)?;
        } else if absolute.is_dir() {
            std::fs::remove_dir_all(&absolute)?;
        }
    }
    Ok(())
}

pub fn stage_all(repo: &Repository) -> Result<(), AppError> {
    let mut index = repo.index()?;
    // An empty pathspec means "everything": tracked modifications, deletions and
    // every untracked file (including nested new folders), i.e. `git add -A`.
    let all: [&Path; 0] = [];
    index.add_all(all, git2::IndexAddOption::DEFAULT, None)?;
    index.update_all(all, None)?;
    index.write()?;
    Ok(())
}

pub fn unstage_all(repo: &Repository) -> Result<(), AppError> {
    match head_object(repo) {
        Ok(target) => {
            let paths: [&Path; 0] = [];
            repo.reset_default(Some(&target), paths)?;
        }
        Err(_) => {
            let mut index = repo.index()?;
            index.clear()?;
            index.write()?;
        }
    }
    Ok(())
}

pub fn discard_all(repo: &Repository) -> Result<(), AppError> {
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let entries = read_status(repo)?;

    // Files that do not exist in HEAD have to be deleted from disk after the
    // reset, otherwise staged new files would just become untracked again.
    let untracked: Vec<String> = entries
        .iter()
        .filter(|entry| {
            head_tree
                .as_ref()
                .map(|tree| tree.get_path(Path::new(&entry.path)).is_err())
                .unwrap_or(true)
        })
        .map(|entry| entry.path.clone())
        .collect();

    if let Ok(target) = head_object(repo) {
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force();
        repo.reset(&target, git2::ResetType::Hard, Some(&mut checkout))?;
    } else if let Ok(mut index) = repo.index() {
        index.clear()?;
        index.write()?;
    }

    if let Some(workdir) = repo.workdir() {
        for path in untracked {
            let absolute = workdir.join(&path);
            if absolute.is_file() {
                std::fs::remove_file(&absolute)?;
            }
        }
    }

    Ok(())
}
