use std::path::Path;

use git2::{Config as GitConfig, Repository};

use crate::error::AppError;
use crate::model::{ConfigSource, RemoteInfo, RemoveRemoteResult, RepoIdentity};

use super::cli::run_blocking;
use super::repo::{host_of_url, remote_names};

fn command_detail(error: &AppError) -> String {
    match error {
        AppError::CommandFailed(detail) => detail.clone(),
        other => other.to_string(),
    }
}

/// `refs/remotes/<name>/*` count, excluding the symbolic `<name>/HEAD` alias.
fn tracking_count(repo: &Repository, name: &str) -> usize {
    let prefix = format!("refs/remotes/{name}/");
    repo.references()
        .map(|refs| {
            refs.flatten()
                .filter_map(|reference| reference.name().map(str::to_string))
                .filter(|ref_name| ref_name.starts_with(&prefix))
                .filter(|ref_name| !ref_name.ends_with("/HEAD"))
                .count()
        })
        .unwrap_or(0)
}

fn remote_info(repo: &Repository, name: &str) -> Option<RemoteInfo> {
    let remote = repo.find_remote(name).ok()?;
    let url = remote.url().unwrap_or_default().trim().to_string();
    if url.is_empty() {
        return None;
    }
    let push_url = remote
        .pushurl()
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != url)
        .map(str::to_string);

    Some(RemoteInfo {
        name: name.to_string(),
        host: host_of_url(&url),
        url,
        push_url,
        is_origin: name == "origin",
        tracking_branches: tracking_count(repo, name),
    })
}

pub fn list_remotes(repo: &Repository) -> Vec<RemoteInfo> {
    let mut remotes: Vec<RemoteInfo> = remote_names(repo)
        .into_iter()
        .filter_map(|name| remote_info(repo, &name))
        .collect();
    // `origin` first, then alphabetical.
    remotes.sort_by(|a, b| {
        b.is_origin
            .cmp(&a.is_origin)
            .then_with(|| a.name.cmp(&b.name))
    });
    remotes
}

fn validate_remote_name(repo: &Repository, name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::RemoteInvalid("远程仓库名称不能为空".to_string()));
    }
    if name.len() > 64 {
        return Err(AppError::RemoteInvalid(
            "远程仓库名称过长（最多 64 个字符）".to_string(),
        ));
    }
    if name.starts_with('-') {
        return Err(AppError::RemoteInvalid(format!(
            "远程仓库名称不能以 - 开头：{name}"
        )));
    }
    let valid = name
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.');
    if !valid {
        return Err(AppError::RemoteInvalid(format!(
            "远程仓库名称只能包含字母、数字、- _ .：{name}"
        )));
    }
    if repo.find_remote(name).is_ok() {
        return Err(AppError::RemoteInvalid(format!(
            "远程仓库 {name} 已存在，请换一个名称"
        )));
    }
    Ok(())
}

fn validate_remote_url(url: &str) -> Result<(), AppError> {
    if url.is_empty() {
        return Err(AppError::RemoteInvalid("远程地址不能为空".to_string()));
    }
    if url.starts_with('-') {
        return Err(AppError::RemoteInvalid("远程地址不能以 - 开头".to_string()));
    }
    if url.chars().any(|ch| ch.is_whitespace() || ch.is_control()) {
        return Err(AppError::RemoteInvalid(
            "远程地址不能包含空格或换行".to_string(),
        ));
    }
    Ok(())
}

/// `git remote add <name> <url>` — format/duplicate checks here, everything else
/// (address syntax, local path existence) is reported by git itself. No network
/// access happens at this point.
pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<RemoteInfo, AppError> {
    let name = name.trim();
    let url = url.trim();
    let repo = super::repo::open_repo(&repo_path.display().to_string())?;
    validate_remote_name(&repo, name)?;
    validate_remote_url(url)?;

    run_blocking(repo_path, &["remote", "add", name, url]).map_err(|error| {
        let detail = command_detail(&error);
        if detail.is_empty() {
            AppError::RemoteInvalid(format!("添加远程仓库 {name} 失败"))
        } else {
            AppError::RemoteInvalid(format!("添加远程仓库 {name} 失败：\n{detail}"))
        }
    })?;

    // Reopen so the just-written config is visible.
    let repo = super::repo::open_repo(&repo_path.display().to_string())?;
    remote_info(&repo, name)
        .ok_or_else(|| AppError::message(format!("远程仓库 {name} 已写入配置，但无法读取，请重试")))
}

/// `git remote remove <name>` — git also drops `refs/remotes/<name>/*` and the
/// branch upstream entries. Local branches and the server are untouched.
pub fn remove_remote(repo_path: &Path, name: &str) -> Result<RemoveRemoteResult, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::RemoteInvalid("远程仓库名称不能为空".to_string()));
    }
    let repo = super::repo::open_repo(&repo_path.display().to_string())?;
    if repo.find_remote(name).is_err() {
        return Err(AppError::RemoteInvalid(format!("远程仓库 {name} 不存在")));
    }
    let removed_tracking = tracking_count(&repo, name);

    run_blocking(repo_path, &["remote", "remove", name]).map_err(|error| {
        AppError::CommandFailed(format!(
            "删除远程仓库 {name} 失败：{}",
            command_detail(&error)
        ))
    })?;

    Ok(RemoveRemoteResult {
        name: name.to_string(),
        removed_tracking,
    })
}

fn read_value(config: &GitConfig, key: &str) -> Option<String> {
    config
        .get_string(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read_at(path: Option<&Path>, key: &str) -> Option<String> {
    match path {
        Some(path) => GitConfig::open(path)
            .ok()
            .and_then(|config| read_value(&config, key)),
        None => GitConfig::open_default()
            .ok()
            .and_then(|config| read_value(&config, key)),
    }
}

/// Effective identity + where it comes from. `local` means `.git/config`,
/// `global` means the default (system + global) config chain.
pub fn read_identity(repo_path: &Path) -> Result<RepoIdentity, AppError> {
    let repo = super::repo::open_repo(&repo_path.display().to_string())?;
    // `commondir` handles linked worktrees, where `.git/config` lives in the
    // main repository directory.
    let local_path = repo.commondir().join("config");

    let (name, name_source) = match read_at(Some(&local_path), "user.name") {
        Some(value) => (Some(value), ConfigSource::Local),
        None => match read_at(None, "user.name") {
            Some(value) => (Some(value), ConfigSource::Global),
            None => (None, ConfigSource::None),
        },
    };
    let (email, email_source) = match read_at(Some(&local_path), "user.email") {
        Some(value) => (Some(value), ConfigSource::Local),
        None => match read_at(None, "user.email") {
            Some(value) => (Some(value), ConfigSource::Global),
            None => (None, ConfigSource::None),
        },
    };

    Ok(RepoIdentity {
        name,
        name_source,
        email,
        email_source,
    })
}

fn validate_identity(name: &str, email: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::ConfigInvalid("提交用户名不能为空".to_string()));
    }
    if name.chars().count() > 100 {
        return Err(AppError::ConfigInvalid(
            "提交用户名过长（最多 100 个字符）".to_string(),
        ));
    }
    if name.chars().any(char::is_control) {
        return Err(AppError::ConfigInvalid(
            "提交用户名不能包含换行或控制字符".to_string(),
        ));
    }

    if email.is_empty() {
        return Err(AppError::ConfigInvalid("提交邮箱不能为空".to_string()));
    }
    let parts: Vec<&str> = email.split('@').collect();
    let looks_like_email = parts.len() == 2
        && !parts[0].is_empty()
        && !parts[1].is_empty()
        && !parts[1].starts_with('.')
        && !parts[1].ends_with('.')
        && email
            .chars()
            .all(|ch| !ch.is_whitespace() && !ch.is_control());
    if !looks_like_email {
        return Err(AppError::ConfigInvalid(format!("邮箱格式不正确：{email}")));
    }
    Ok(())
}

/// Write `user.name` / `user.email` into `.git/config` only — the global config
/// is never touched.
pub fn set_identity(repo_path: &Path, name: &str, email: &str) -> Result<RepoIdentity, AppError> {
    let name = name.trim();
    let email = email.trim();
    validate_identity(name, email)?;

    run_blocking(repo_path, &["config", "--local", "user.name", name]).map_err(|error| {
        AppError::CommandFailed(format!("写入 user.name 失败：{}", command_detail(&error)))
    })?;

    if let Err(error) = run_blocking(repo_path, &["config", "--local", "user.email", email]) {
        return Err(AppError::ConfigInvalid(format!(
            "user.name 已写入本地配置，但 user.email 写入失败：{}\n请重试或手动执行 git config --local user.email <邮箱>",
            command_detail(&error)
        )));
    }

    read_identity(repo_path)
}
