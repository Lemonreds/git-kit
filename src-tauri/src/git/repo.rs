use std::path::{Path, PathBuf};

use git2::{Repository, StatusOptions};

use crate::error::AppError;
use crate::model::{CommitSummary, RepoSnapshot};

/// Canonicalize + validate a user supplied folder, returning an open repo.
pub fn open_repo(path: &str) -> Result<Repository, AppError> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(AppError::NotFound(path.display().to_string()));
    }
    if !path.is_dir() {
        return Err(AppError::message("请选择一个文件夹，而不是文件"));
    }
    Repository::open(path).map_err(|err| {
        // libgit2 reports OS level failures (macOS TCC, sandbox) as generic
        // errors, so classify on the message to give the UI an actionable hint.
        if is_permission_error(&err) {
            return AppError::Permission(format!(
                "{}（可在 系统设置 → 隐私与安全性 → 文件与文件夹 中允许 Git Kit 访问）",
                path.display()
            ));
        }
        match err.code() {
            git2::ErrorCode::NotFound => AppError::NotARepo(path.display().to_string()),
            _ => AppError::Git(err),
        }
    })
}

fn is_permission_error(err: &git2::Error) -> bool {
    let message = err.message().to_ascii_lowercase();
    message.contains("permission denied")
        || message.contains("operation not permitted")
        || message.contains("access is denied")
}

pub fn canonical_path(path: &str) -> Result<PathBuf, AppError> {
    let path = Path::new(path);
    std::fs::canonicalize(path).map_err(|err| match err.kind() {
        std::io::ErrorKind::NotFound => AppError::NotFound(path.display().to_string()),
        std::io::ErrorKind::PermissionDenied => AppError::Permission(path.display().to_string()),
        _ => AppError::Io(err),
    })
}

pub fn display_name(repo: &Repository, canonical: &Path) -> String {
    let workdir = repo
        .workdir()
        .and_then(|dir| dir.file_name())
        .and_then(|name| name.to_str())
        .map(str::to_string);
    workdir.unwrap_or_else(|| {
        canonical
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("未命名仓库")
            .trim_end_matches(".git")
            .to_string()
    })
}

/// Prefer `origin`, then the first configured remote, then the plain folder
/// path so the sidebar footer always has something explicit to show.
pub fn remote_url(repo: &Repository) -> Option<String> {
    let from_remote = |name: &str| {
        repo.find_remote(name)
            .ok()
            .and_then(|remote| remote.url().map(normalize_remote_url))
            .filter(|url| !url.is_empty())
    };

    if let Some(url) = from_remote("origin") {
        return Some(url);
    }

    let names = repo.remotes().ok()?;
    names.iter().flatten().find_map(|name| from_remote(name))
}

/// Turn `git@host:org/repo.git` into `host/org/repo` for a tidy footer label,
/// keeping web URLs untouched apart from stripping the `.git` suffix.
fn normalize_remote_url(url: &str) -> String {
    let trimmed = url.trim();
    if let Some(rest) = trimmed.strip_prefix("git@") {
        if let Some((host, path)) = rest.split_once(':') {
            return format!("{host}/{}", path.trim_end_matches(".git"));
        }
    }
    if let Some(rest) = trimmed.strip_prefix("ssh://") {
        let rest = rest.strip_prefix("git@").unwrap_or(rest);
        return rest
            .trim_end_matches('/')
            .trim_end_matches(".git")
            .to_string();
    }
    trimmed.trim_end_matches(".git").to_string()
}

/// Host part only (`github.com`, `gitlab.company.com`) — the sidebar footer
/// shows this while the full URL stays available for copying / tooltips.
pub fn remote_host(repo: &Repository) -> Option<String> {
    remote_url(repo).as_deref().and_then(host_of_url)
}

/// Host of an arbitrary remote URL (also used by the remote manager, where the
/// URL has not been written to the config yet).
pub fn host_of_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() || trimmed.starts_with("file://") {
        return None;
    }

    // scheme://[user@]host[:port]/path
    if let Some(index) = trimmed.find("://") {
        let authority = trimmed[index + 3..].split('/').next().unwrap_or_default();
        let authority = authority.rsplit('@').next().unwrap_or(authority);
        let host = authority.split(':').next().unwrap_or(authority);
        return (!host.is_empty()).then(|| host.to_string());
    }

    // scp-like [user@]host:path — reject plain filesystem paths (`/a/b`, `C:\`).
    if let Some((left, _)) = trimmed.split_once(':') {
        let host = left.rsplit('@').next().unwrap_or(left);
        let looks_like_host = left.contains('@') || left.contains('.');
        if looks_like_host && !host.contains('/') && !host.is_empty() {
            return Some(host.to_string());
        }
    }

    // Already normalized (`github.com/acme/repo`): first segment is the host.
    let first = trimmed.split_once('/').map(|(first, _)| first);
    if let Some(first) = first.filter(|first| !first.is_empty() && first.contains('.')) {
        return Some(first.to_string());
    }

    None
}

/// `main`, or `detached@1a2b3c4` when HEAD is not on a branch.
pub fn head_branch(repo: &Repository) -> Option<String> {
    if repo.head_detached().unwrap_or(false) {
        return repo
            .head()
            .ok()
            .and_then(|head| head.peel_to_commit().ok())
            .map(|commit| format!("detached@{}", short_id(&commit)));
    }

    let head = repo.head().ok()?;
    if !head.is_branch() {
        return None;
    }
    head.shorthand().map(str::to_string)
}

pub fn is_dirty(repo: &Repository) -> bool {
    if repo.is_bare() {
        return false;
    }
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(true);
    match repo.statuses(Some(&mut opts)) {
        Ok(statuses) => statuses
            .iter()
            .any(|entry| entry.status() != git2::Status::CURRENT),
        Err(_) => false,
    }
}

pub fn snapshot(repo: &Repository, canonical: &Path) -> RepoSnapshot {
    RepoSnapshot {
        path: canonical.display().to_string(),
        name: display_name(repo, canonical),
        url: remote_url(repo),
        remote_host: remote_host(repo),
        head_branch: head_branch(repo),
        is_dirty: is_dirty(repo),
        is_bare: repo.is_bare(),
    }
}

pub fn short_id(commit: &git2::Commit<'_>) -> String {
    commit
        .as_object()
        .short_id()
        .ok()
        .and_then(|buf| buf.as_str().map(str::to_string))
        .unwrap_or_else(|| commit.id().to_string()[..7].to_string())
}

/// `refs/remotes` ref names, longest remote name first so `origin/foo` is not
/// matched by a remote literally called `or`.
pub fn remote_names(repo: &Repository) -> Vec<String> {
    let mut names: Vec<String> = repo
        .remotes()
        .ok()
        .map(|list| list.iter().flatten().map(str::to_string).collect())
        .unwrap_or_default();
    names.sort_by_key(|name| std::cmp::Reverse(name.len()));
    names
}

/// `refs/remotes/origin/feature/x` → `feature/x`.
pub fn remote_branch_name(repo: &Repository, ref_name: &str) -> String {
    let stripped = ref_name.trim_start_matches("refs/remotes/");
    for remote in remote_names(repo) {
        if let Some(rest) = stripped
            .strip_prefix(remote.as_str())
            .and_then(|rest| rest.strip_prefix('/'))
        {
            return rest.to_string();
        }
    }
    stripped.to_string()
}

pub fn summarize(commit: &git2::Commit<'_>) -> CommitSummary {
    let author = commit.author();
    CommitSummary {
        sha: commit.id().to_string(),
        short_sha: short_id(commit),
        summary: commit.summary().unwrap_or("(无提交说明)").to_string(),
        author_name: author.name().unwrap_or("未知作者").to_string(),
        author_email: author.email().unwrap_or_default().to_string(),
        committed_at: commit.time().seconds(),
    }
}

/// Resolve a UI supplied rev (`HEAD`, `refs/heads/main`, `origin/main`, sha)
/// to an object id.
pub fn resolve_rev(repo: &Repository, rev: &str) -> Option<git2::Oid> {
    let rev = rev.trim();
    if rev.is_empty() {
        return None;
    }
    if let Ok(oid) = git2::Oid::from_str(rev) {
        return Some(oid);
    }
    let candidates = if rev.starts_with("refs/") {
        vec![rev.to_string()]
    } else {
        vec![
            rev.to_string(),
            format!("refs/heads/{rev}"),
            format!("refs/remotes/{rev}"),
            format!("refs/tags/{rev}"),
        ]
    };
    candidates
        .iter()
        .find_map(|name| repo.refname_to_id(name).ok())
        .or_else(|| repo.revparse_single(rev).ok().map(|object| object.id()))
}
