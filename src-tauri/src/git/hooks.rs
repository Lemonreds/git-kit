use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::error::AppError;
use crate::model::HookInfo;

use super::repo::open_repo;

/// Hooks git looks for in `.git/hooks`, roughly in the order they normally run.
/// Used to order the list and to offer the templates that ship with git.
const HOOK_NAMES: &[&str] = &[
    "applypatch-msg",
    "pre-applypatch",
    "post-applypatch",
    "pre-commit",
    "pre-merge-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "pre-rebase",
    "post-checkout",
    "post-merge",
    "pre-push",
    "pre-receive",
    "update",
    "post-receive",
    "post-update",
    "push-to-checkout",
    "pre-auto-gc",
    "post-rewrite",
    "sendemail-validate",
    "fsmonitor-watchman",
    "p4-changelist",
    "p4-prepare-changelist",
    "p4-post-changelist",
    "p4-pre-submit",
    "post-index-change",
];

fn hooks_dir(repo_path: &Path) -> Result<PathBuf, AppError> {
    let repo = open_repo(&repo_path.display().to_string())?;
    // `repo.path()` is the real git dir, so linked worktrees and submodules land
    // in the right place instead of assuming `<repo>/.git`.
    Ok(repo.path().join("hooks"))
}

/// Reject anything that could escape the hooks directory.
fn hook_name(name: &str) -> Result<&str, AppError> {
    let trimmed = name.trim();
    let valid = !trimmed.is_empty()
        && trimmed != "."
        && trimmed != ".."
        && !trimmed.contains('/')
        && !trimmed.contains('\\')
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if !valid {
        return Err(AppError::message("非法的钩子名称"));
    }
    Ok(trimmed)
}

#[cfg(unix)]
fn is_executable(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable(_metadata: &fs::Metadata) -> bool {
    true
}

#[cfg(unix)]
fn set_executable(path: &Path, executable: bool) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;
    let mode = if executable { 0o755 } else { 0o644 };
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
        .map_err(|err| AppError::message(format!("无法修改钩子权限：{err}")))
}

#[cfg(not(unix))]
fn set_executable(_path: &Path, _executable: bool) -> Result<(), AppError> {
    Ok(())
}

fn info(dir: &Path, name: &str) -> HookInfo {
    let hook_path = dir.join(name);
    let sample_path = dir.join(format!("{name}.sample"));
    let hook_meta = fs::metadata(&hook_path).ok().filter(fs::Metadata::is_file);
    let sample_meta = fs::metadata(&sample_path).ok().filter(fs::Metadata::is_file);

    HookInfo {
        name: name.to_string(),
        present: hook_meta.is_some(),
        enabled: hook_meta.as_ref().map(is_executable).unwrap_or(false),
        has_sample: sample_meta.is_some(),
        size: hook_meta.as_ref().map(fs::Metadata::len).unwrap_or(0),
        modified_at: hook_meta
            .as_ref()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs() as i64),
    }
}

/// Every known hook, plus any extra executable files someone dropped into the
/// directory (custom hook wrappers are common enough to list).
pub fn list_hooks(repo_path: &Path) -> Result<Vec<HookInfo>, AppError> {
    let dir = hooks_dir(repo_path)?;
    let mut names: Vec<String> = HOOK_NAMES.iter().map(|name| name.to_string()).collect();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.ends_with(".sample") {
                continue;
            }
            if names.iter().any(|known| known == &file_name) {
                continue;
            }
            if entry.path().is_file() {
                names.push(file_name);
            }
        }
    }

    Ok(names
        .iter()
        .map(|name| info(&dir, name))
        .filter(|hook| hook.present || hook.has_sample || HOOK_NAMES.contains(&hook.name.as_str()))
        .collect())
}

fn read_text(path: &Path) -> Result<String, AppError> {
    fs::read_to_string(path).map_err(|err| AppError::message(format!("无法读取文件：{err}")))
}

/// Content of the hook, or of its `<name>.sample` template when the hook itself
/// does not exist yet. Missing files read as an empty script.
pub fn read_hook(repo_path: &Path, name: &str) -> Result<String, AppError> {
    let name = hook_name(name)?;
    let dir = hooks_dir(repo_path)?;
    let hook_path = dir.join(name);
    if hook_path.is_file() {
        return read_text(&hook_path);
    }
    let sample_path = dir.join(format!("{name}.sample"));
    if sample_path.is_file() {
        return read_text(&sample_path);
    }
    Ok(String::new())
}

/// Write (or replace) a hook and set its executable bit to `enabled`.
pub fn write_hook(
    repo_path: &Path,
    name: &str,
    content: &str,
    enabled: bool,
) -> Result<Vec<HookInfo>, AppError> {
    let name = hook_name(name)?;
    let dir = hooks_dir(repo_path)?;
    fs::create_dir_all(&dir).map_err(|err| AppError::message(format!("无法创建钩子目录：{err}")))?;
    let hook_path = dir.join(name);
    fs::write(&hook_path, content)
        .map_err(|err| AppError::message(format!("无法写入钩子：{err}")))?;
    set_executable(&hook_path, enabled)?;
    list_hooks(repo_path)
}

/// Toggle the executable bit, which is how git decides whether a hook runs.
pub fn set_hook_enabled(
    repo_path: &Path,
    name: &str,
    enabled: bool,
) -> Result<Vec<HookInfo>, AppError> {
    let name = hook_name(name)?;
    let dir = hooks_dir(repo_path)?;
    let hook_path = dir.join(name);
    if !hook_path.is_file() {
        return Err(AppError::message("这个钩子还不存在，请先编辑并保存"));
    }
    set_executable(&hook_path, enabled)?;
    list_hooks(repo_path)
}

/// Remove the hook file. The `.sample` template is left untouched.
pub fn delete_hook(repo_path: &Path, name: &str) -> Result<Vec<HookInfo>, AppError> {
    let name = hook_name(name)?;
    let dir = hooks_dir(repo_path)?;
    let hook_path = dir.join(name);
    if hook_path.is_file() {
        fs::remove_file(&hook_path).map_err(|err| AppError::message(format!("无法删除钩子：{err}")))?;
    }
    list_hooks(repo_path)
}