//! `git clone` for a repository that is not on disk yet.
//!
//! Cloning is the one write operation with no repository to point `-C` at, so it
//! runs *inside the chosen parent directory* and reuses the system git binary —
//! the same SSH keys / credential helper / proxy configuration every other
//! network operation already relies on.
//!
//! Both the address and the folder name arrive from the webview, so this module
//! is the boundary that keeps a clone from landing outside the folder the user
//! picked: the name is a single path segment by construction (no separators, no
//! `..`), the address goes through the same checks as `git remote add`, and the
//! target has to be missing or empty.

use std::path::{Path, PathBuf};

use crate::error::AppError;

use super::cli::{run, CLONE_TIMEOUT};
use super::config::validate_remote_url;
use super::repo::open_repo;

/// Last path segment of a remote address, without the `.git` suffix.
///
/// Handles the shapes people actually paste:
/// `https://host/owner/repo.git`, `ssh://git@host:22/owner/repo`, the
/// scp-style `git@host:owner/repo.git` and a Windows local path
/// `C:\\repos\\mine`. An address with no usable segment comes back empty, which
/// the UI treats as "the user has to type a name".
pub fn repo_name_from_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches(|ch| ch == '/' || ch == '\\');
    let last = trimmed
        .rsplit(|ch| ch == '/' || ch == ':' || ch == '\\')
        .next()
        .unwrap_or_default();
    last.strip_suffix(".git").unwrap_or(last).to_string()
}

/// A repository folder name is one path segment — never a path.
fn validate_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::message("仓库名称不能为空"));
    }
    if name == "." || name == ".." {
        return Err(AppError::message("仓库名称不能是 . 或 .."));
    }
    if name.starts_with('-') {
        return Err(AppError::message(format!("仓库名称不能以 - 开头：{name}")));
    }
    if name
        .chars()
        .any(|ch| ch == '/' || ch == '\\' || ch.is_control())
    {
        return Err(AppError::message(format!(
            "仓库名称不能包含路径分隔符或控制字符：{name}"
        )));
    }
    Ok(())
}

/// Clone `url` into `<parent>/<name>` and hand back the canonical folder.
///
/// Errors keep git's own `fatal:` output: a failed clone is almost always an
/// address, credential or network problem, and that detail is the only thing
/// that tells the user which one it was.
pub fn clone_repo(parent: &Path, url: &str, name: &str) -> Result<PathBuf, AppError> {
    let url = url.trim();
    validate_remote_url(url)?;
    let name = name.trim();
    validate_name(name)?;

    if !parent.is_dir() {
        return Err(AppError::NotFound(parent.display().to_string()));
    }

    let target = parent.join(name);
    if target.exists() {
        // git itself accepts an existing *empty* directory, so only a folder that
        // already holds something (or a same-named file) is a conflict.
        let empty = std::fs::read_dir(&target)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
        if !empty {
            return Err(AppError::message(format!(
                "目标文件夹已存在且不为空：{}\n请选择其他位置，或修改仓库名称",
                target.display()
            )));
        }
    }

    // `--` closes the argument list: even though `validate_remote_url` already
    // rejects a leading `-`, the address must never be readable as an option.
    run(parent, &["clone", "--", url, name], Some(CLONE_TIMEOUT)).map_err(|error| {
        let detail = match &error {
            AppError::CommandFailed(detail) => detail.clone(),
            other => other.to_string(),
        };
        if detail.is_empty() {
            AppError::CommandFailed("克隆失败".to_string())
        } else {
            AppError::CommandFailed(format!("克隆失败：\n{detail}"))
        }
    })?;

    let canonical = std::fs::canonicalize(&target).map_err(|_| {
        AppError::message(format!(
            "克隆命令已结束，但找不到目标文件夹：{}",
            target.display()
        ))
    })?;
    // Trust but verify: a git that exited 0 still has to have left something we
    // can open, otherwise the sidebar would get an entry it can never show.
    open_repo(&canonical.display().to_string())?;
    Ok(canonical)
}
