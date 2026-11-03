use std::fs;
use std::path::{Component, Path, PathBuf};

use git2::{IndexConflict, IndexEntry, Repository};

use crate::error::AppError;
use crate::model::{
    ConflictFile, ConflictFileDetail, ConflictKind, ConflictSide, RepoOperationState,
};

use super::cli::run_blocking;

/// Per-side text budget. A conflict file is read up to three times (ancestor,
/// ours, theirs) plus the worktree copy, so the cap is what keeps a pathological
/// generated file from holding tens of megabytes in the webview.
const MAX_SIDE_BYTES: usize = 1_500_000;
const MAX_SIDE_LINES: usize = 40_000;
/// libgit2 only needs a prefix to decide whether a blob is binary.
const BINARY_SNIFF_BYTES: usize = 8_000;

/// One conflicted path with its raw index stages, kept together so listing and
/// reading never have to walk the conflict iterator twice.
struct IndexedConflict {
    path: String,
    kind: ConflictKind,
    ancestor: Option<IndexEntry>,
    our: Option<IndexEntry>,
    their: Option<IndexEntry>,
}

fn path_of(conflict: &IndexConflict) -> Option<String> {
    let entry = conflict
        .our
        .as_ref()
        .or(conflict.their.as_ref())
        .or(conflict.ancestor.as_ref())?;
    Some(String::from_utf8_lossy(&entry.path).to_string())
}

fn kind_of(conflict: &IndexConflict) -> ConflictKind {
    match (
        conflict.ancestor.is_some(),
        conflict.our.is_some(),
        conflict.their.is_some(),
    ) {
        (true, true, true) => ConflictKind::BothModified,
        (false, true, true) => ConflictKind::BothAdded,
        (true, false, true) => ConflictKind::DeletedByUs,
        (true, true, false) => ConflictKind::DeletedByThem,
        (true, false, false) => ConflictKind::BothDeleted,
        _ => ConflictKind::Unknown,
    }
}

fn collect(repo: &Repository) -> Result<Vec<IndexedConflict>, AppError> {
    let index = repo.index()?;
    let mut found: Vec<IndexedConflict> = Vec::new();
    // libgit2 yields one `IndexConflict` per path, so no de-duplication needed.
    for conflict in index.conflicts()?.flatten() {
        let Some(path) = path_of(&conflict) else {
            continue;
        };
        found.push(IndexedConflict {
            path,
            kind: kind_of(&conflict),
            ancestor: conflict.ancestor,
            our: conflict.our,
            their: conflict.their,
        });
    }
    found.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(found)
}

/// Paths with an unresolved index conflict, sorted. This is the single source of
/// truth for the status banner, the worktree list and the resolver.
pub fn conflict_paths(repo: &Repository) -> Vec<String> {
    collect(repo)
        .map(|list| list.into_iter().map(|entry| entry.path).collect())
        .unwrap_or_default()
}

pub fn list_conflicts(repo: &Repository) -> Result<Vec<ConflictFile>, AppError> {
    Ok(collect(repo)?
        .into_iter()
        .map(|entry| ConflictFile {
            path: entry.path,
            kind: entry.kind,
            has_base: entry.ancestor.is_some(),
            has_ours: entry.our.is_some(),
            has_theirs: entry.their.is_some(),
        })
        .collect())
}

/// Cut a blob down to the budget without copying it twice. Returns the text, a
/// truncation flag and the resulting line count.
fn clip(bytes: &[u8]) -> (String, bool, usize) {
    let end = bytes.len().min(MAX_SIDE_BYTES);
    let mut truncated = end < bytes.len();

    let mut text = String::from_utf8_lossy(&bytes[..end]).into_owned();
    // A byte cut can split a multi-byte character; the lossy replacement at the
    // very end is an artefact of the cap, not part of the file.
    if truncated && text.ends_with('\u{FFFD}') {
        text.pop();
    }

    let mut lines = count_lines(&text);
    if lines > MAX_SIDE_LINES {
        let mut seen = 0usize;
        let mut cut = text.len();
        for (index, _) in text.match_indices('\n') {
            seen += 1;
            if seen == MAX_SIDE_LINES {
                cut = index + 1;
                break;
            }
        }
        text.truncate(cut);
        lines = MAX_SIDE_LINES;
        truncated = true;
    }

    (text, truncated, lines)
}

fn count_lines(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }
    let newlines = text.bytes().filter(|byte| *byte == b'\n').count();
    if text.ends_with('\n') {
        newlines
    } else {
        newlines + 1
    }
}

fn is_binary(repo: &Repository, entry: &IndexEntry) -> bool {
    match repo.find_blob(entry.id) {
        Ok(blob) => {
            let content = blob.content();
            let sniff = &content[..content.len().min(BINARY_SNIFF_BYTES)];
            sniff.contains(&0) || blob.is_binary()
        }
        Err(_) => false,
    }
}

fn read_stage(repo: &Repository, entry: Option<&IndexEntry>) -> ConflictSide {
    let Some(entry) = entry else {
        return ConflictSide {
            text: None,
            lines: 0,
            truncated: false,
            is_binary: false,
        };
    };
    if is_binary(repo, entry) {
        return ConflictSide {
            text: None,
            lines: 0,
            truncated: false,
            is_binary: true,
        };
    }
    let Ok(blob) = repo.find_blob(entry.id) else {
        return ConflictSide {
            text: None,
            lines: 0,
            truncated: false,
            is_binary: false,
        };
    };
    let (text, truncated, lines) = clip(blob.content());
    ConflictSide {
        text: Some(text),
        lines,
        truncated,
        is_binary: false,
    }
}

/// What is currently on disk for a conflicted path.
struct WorktreeText {
    text: Option<String>,
    truncated: bool,
    binary: bool,
}

fn read_worktree(workdir: Option<&Path>, path: &str) -> WorktreeText {
    let missing = WorktreeText {
        text: None,
        truncated: false,
        binary: false,
    };
    let Some(workdir) = workdir else {
        return missing;
    };
    let Ok(bytes) = fs::read(workdir.join(path)) else {
        return missing;
    };
    if bytes[..bytes.len().min(BINARY_SNIFF_BYTES)].contains(&0) {
        return WorktreeText {
            text: None,
            truncated: false,
            binary: true,
        };
    }
    let (text, truncated, _) = clip(&bytes);
    WorktreeText {
        text: Some(text),
        truncated,
        binary: false,
    }
}

fn detect_eol(text: Option<&str>, fallback: Option<&str>) -> String {
    let sample = text.or(fallback).unwrap_or_default();
    let crlf = sample.matches("\r\n").count();
    let lf = sample.matches('\n').count();
    if crlf > 0 && crlf * 2 >= lf {
        "crlf".to_string()
    } else {
        "lf".to_string()
    }
}

fn read_text_file(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Strip the `refs/heads/` / `refs/remotes/` prefix git writes into its state
/// files so the label reads like the rest of the app (`origin/main`).
fn clean_ref(name: &str) -> String {
    name.trim()
        .trim_start_matches("refs/heads/")
        .trim_start_matches("refs/remotes/")
        .to_string()
}

/// Best-effort label of the incoming side, taken from the operation git left
/// behind: `Merge branch 'x'`, `Merge tag 'x'`, or the rebase head name.
fn theirs_label(repo: &Repository) -> Option<String> {
    let git_dir = repo.path();
    if let Some(message) = read_text_file(&git_dir.join("MERGE_MSG")) {
        let first = message.lines().next().unwrap_or_default();
        if let Some(start) = first.find('\'') {
            if let Some(end) = first[start + 1..].find('\'') {
                let name = &first[start + 1..start + 1 + end];
                return Some(clean_ref(name));
            }
        }
    }
    if let Some(name) = read_text_file(&git_dir.join("rebase-merge").join("head-name")) {
        return Some(clean_ref(&name));
    }
    if let Some(name) = read_text_file(&git_dir.join("rebase-apply").join("head-name")) {
        return Some(clean_ref(&name));
    }
    if let Some(sha) = read_text_file(&git_dir.join("CHERRY_PICK_HEAD")) {
        return Some(short_sha(&sha));
    }
    if let Some(sha) = read_text_file(&git_dir.join("REVERT_HEAD")) {
        return Some(short_sha(&sha));
    }
    None
}

fn short_sha(sha: &str) -> String {
    sha.chars().take(7).collect()
}

fn ours_label(repo: &Repository) -> String {
    super::repo::head_branch(repo).unwrap_or_else(|| "HEAD".to_string())
}

fn find_conflict(repo: &Repository, path: &str) -> Result<IndexedConflict, AppError> {
    collect(repo)?
        .into_iter()
        .find(|entry| entry.path == path)
        .ok_or_else(|| {
            AppError::ConflictInvalid(format!(
                "「{path}」不在当前冲突列表里：可能已经在别处解决，请刷新后重试"
            ))
        })
}

pub fn conflict_file(repo: &Repository, path: &str) -> Result<ConflictFileDetail, AppError> {
    let entry = find_conflict(repo, path)?;
    let ours = read_stage(repo, entry.our.as_ref());
    let theirs = read_stage(repo, entry.their.as_ref());
    let base = read_stage(repo, entry.ancestor.as_ref());

    let worktree = read_worktree(repo.workdir(), path);

    let eol = detect_eol(worktree.text.as_deref(), ours.text.as_deref());
    let truncated = ours.truncated || theirs.truncated || base.truncated || worktree.truncated;

    Ok(ConflictFileDetail {
        path: path.to_string(),
        kind: entry.kind,
        complete: !truncated,
        truncated,
        eol,
        ours_label: ours_label(repo),
        theirs_label: theirs_label(repo).unwrap_or_else(|| "对方".to_string()),
        base,
        ours,
        theirs,
        worktree_binary: worktree.binary,
        worktree_text: worktree.text,
    })
}

// --- writing ---------------------------------------------------------------

/// Reject anything that is not a plain path inside this worktree. The path also
/// has to be in the current conflict list, so a stale UI can never write to a
/// file git no longer considers conflicted.
fn validate_path(repo: &Repository, path: &str) -> Result<PathBuf, AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') || trimmed.contains('\0') {
        return Err(AppError::ConflictInvalid(format!("非法的路径：{path}")));
    }
    let relative = Path::new(trimmed);
    if relative.is_absolute() {
        return Err(AppError::ConflictInvalid(format!("非法的路径：{path}")));
    }
    if relative
        .components()
        .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err(AppError::ConflictInvalid(format!("非法的路径：{path}")));
    }

    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::ConflictInvalid("该仓库没有工作区，无法保存解决结果".to_string()))?;
    Ok(workdir.join(relative))
}

/// `git add -- <path>` (never `git add -A`): staging stays scoped to the file the
/// user just resolved. The CLI rewrites the index on disk, so callers reopen the
/// repository before reading state again.
fn stage_path(repo_path: &Path, path: &str) -> Result<(), AppError> {
    run_blocking(repo_path, &["add", "--", path])
        .map(|_| ())
        .map_err(|error| AppError::CommandFailed(format!("暂存 {path} 失败：{error}")))
}

/// Write the resolved text back to the worktree and stage it in one step.
///
/// The write is atomic (temp file + rename in the same folder) and keeps the
/// original permission bits, so a half-written file is never staged.
pub fn resolve_conflict(
    repo_path: &Path,
    path: &str,
    content: &str,
) -> Result<RepoOperationState, AppError> {
    let repo = super::repo::open_repo(&repo_path.display().to_string())?;
    find_conflict(&repo, path)?;
    let absolute = validate_path(&repo, path)?;
    let parent = absolute
        .parent()
        .ok_or_else(|| AppError::ConflictInvalid(format!("非法的路径：{path}")))?;
    fs::create_dir_all(parent)?;

    let permissions = fs::metadata(&absolute).ok().map(|meta| meta.permissions());
    let temp = parent.join(format!(
        ".{}.gitkit-tmp",
        absolute
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("resolve")
    ));
    fs::write(&temp, content.as_bytes())?;
    if let Some(permissions) = permissions {
        let _ = fs::set_permissions(&temp, permissions);
    }
    if let Err(error) = fs::rename(&temp, &absolute) {
        let _ = fs::remove_file(&temp);
        return Err(AppError::Io(error));
    }

    stage_path(repo_path, path)?;

    let repo = super::repo::open_repo(&repo_path.display().to_string())?;
    Ok(super::workflow::repo_state(&repo))
}

/// Accept one whole side without editing: `git checkout --ours/--theirs -- path`
/// (or `git rm` when the chosen side has no file), then stage it.
pub fn resolve_conflict_side(
    repo_path: &Path,
    path: &str,
    side: &str,
) -> Result<RepoOperationState, AppError> {
    let repo = super::repo::open_repo(&repo_path.display().to_string())?;
    let entry = find_conflict(&repo, path)?;
    validate_path(&repo, path)?;

    let exists = match side {
        "ours" => entry.our.is_some(),
        "theirs" => entry.their.is_some(),
        "delete" => false,
        other => {
            return Err(AppError::ConflictInvalid(format!(
                "不支持的解决方式：{other}（只能是 ours / theirs / delete）"
            )));
        }
    };

    if exists {
        let flag = if side == "ours" { "--ours" } else { "--theirs" };
        run_blocking(repo_path, &["checkout", flag, "--", path]).map_err(|error| {
            AppError::CommandFailed(format!("采用{side}版本失败：{error}"))
        })?;
        stage_path(repo_path, path)?;
    } else {
        run_blocking(repo_path, &["rm", "--force", "--quiet", "--", path]).map_err(|error| {
            AppError::CommandFailed(format!("删除 {path} 失败：{error}"))
        })?;
    }

    let repo = super::repo::open_repo(&repo_path.display().to_string())?;
    Ok(super::workflow::repo_state(&repo))
}