use std::collections::HashSet;
use std::path::{Component, Path};

use git2::Repository;

use crate::error::AppError;
use crate::model::{BlameHunk, BlameWindow, FileHistoryEntry, FileHistoryPage};

use super::cli::run_blocking;
use super::repo::{open_repo, resolve_rev};

/// History rows per request. A file that changed 2000 times would only ever need
/// the newest few hundred to find "when did this break", and the cap keeps the
/// IPC payload plus the retained list bounded.
const DEFAULT_HISTORY: usize = 100;
const MAX_HISTORY: usize = 500;

/// Lines per blame request. The UI asks for the next window while scrolling, so
/// a 20k-line file never materialises more than a few windows at once.
const MAX_BLAME_WINDOW: usize = 2_000;
/// Above this the file is not scanned on disk just to count lines.
const MAX_COUNT_BYTES: u64 = 4_000_000;

fn validate_path(path: &str) -> Result<(), AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') || trimmed.contains('\0') {
        return Err(AppError::message(format!("非法的文件路径：{path}")));
    }
    let relative = Path::new(trimmed);
    if relative.is_absolute()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err(AppError::message(format!("非法的文件路径：{path}")));
    }
    Ok(())
}

fn validate_rev(rev: &str) -> Result<(), AppError> {
    if rev.trim().is_empty() || rev.starts_with('-') || rev.contains('\0') {
        return Err(AppError::message(format!("非法的版本：{rev}")));
    }
    Ok(())
}

fn worktree_line_count(repo: &Repository, path: &str) -> Option<usize> {
    let workdir = repo.workdir()?;
    let absolute = workdir.join(path);
    let meta = std::fs::metadata(&absolute).ok()?;
    if meta.len() > MAX_COUNT_BYTES {
        return None;
    }
    let bytes = std::fs::read(&absolute).ok()?;
    Some(count_lines(&bytes))
}

fn rev_line_count(repo: &Repository, rev: &str, path: &str) -> Option<usize> {
    let oid = resolve_rev(repo, rev)?;
    let commit = repo.find_commit(oid).ok()?;
    let tree = commit.tree().ok()?;
    let entry = tree.get_path(Path::new(path)).ok()?;
    let blob = entry.to_object(repo).ok()?.peel_to_blob().ok()?;
    Some(count_lines(blob.content()))
}

fn count_lines(bytes: &[u8]) -> usize {
    if bytes.is_empty() {
        return 0;
    }
    let newlines = bytes.iter().filter(|byte| **byte == b'\n').count();
    if bytes.ends_with(b"\n") {
        newlines
    } else {
        newlines + 1
    }
}

/// One parsed line of `git blame --line-porcelain`.
struct BlameLine {
    sha: String,
    author: String,
    email: String,
    time: i64,
    summary: String,
    final_line: usize,
    text: String,
}

fn parse_mail(value: &str) -> String {
    value.trim().trim_start_matches('<').trim_end_matches('>').to_string()
}

/// Parse `--line-porcelain`: a header line (`<sha> <orig> <final> [<group>]`),
/// key/value metadata lines, then the `\t`-prefixed file line.
fn parse_porcelain(stdout: &str) -> Vec<BlameLine> {
    let mut parsed: Vec<BlameLine> = Vec::new();
    let mut header: Option<(String, usize)> = None;
    let mut author = String::new();
    let mut email = String::new();
    let mut time = 0i64;
    let mut summary = String::new();

    for raw in stdout.lines() {
        if let Some(content) = raw.strip_prefix('\t') {
            if let Some((sha, final_line)) = header.take() {
                parsed.push(BlameLine {
                    sha,
                    author: author.clone(),
                    email: email.clone(),
                    time,
                    summary: summary.clone(),
                    final_line,
                    text: content.to_string(),
                });
            }
            continue;
        }

        // A header line is 40 hex chars, a space, then two or three numbers.
        if raw.len() > 41 && raw.as_bytes()[40] == b' ' && raw[..40].bytes().all(|b| b.is_ascii_hexdigit())
        {
            let mut parts = raw[41..].split(' ');
            let _orig = parts.next();
            let final_line = parts
                .next()
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(0);
            header = Some((raw[..40].to_string(), final_line));
            author.clear();
            email.clear();
            time = 0;
            summary.clear();
            continue;
        }

        if let Some(value) = raw.strip_prefix("author ") {
            author = value.to_string();
        } else if let Some(value) = raw.strip_prefix("author-mail ") {
            email = parse_mail(value);
        } else if let Some(value) = raw.strip_prefix("author-time ") {
            time = value.trim().parse::<i64>().unwrap_or(0);
        } else if let Some(value) = raw.strip_prefix("summary ") {
            summary = value.to_string();
        }
    }

    parsed
}

fn is_zero_sha(sha: &str) -> bool {
    sha.bytes().all(|byte| byte == b'0')
}

/// Merge consecutive lines of the same commit into display hunks, so the UI gets
/// one row per run instead of one row per line.
fn to_hunks(lines: Vec<BlameLine>) -> Vec<BlameHunk> {
    let mut hunks: Vec<BlameHunk> = Vec::new();
    for line in lines {
        let uncommitted = is_zero_sha(&line.sha);
        if let Some(last) = hunks.last_mut() {
            let same_commit = last.commit_sha.as_deref().map_or(uncommitted, |sha| sha == line.sha)
                && last.start_line + last.lines == line.final_line;
            if same_commit {
                last.lines += 1;
                continue;
            }
        }
        hunks.push(BlameHunk {
            commit_sha: if uncommitted { None } else { Some(line.sha.clone()) },
            short_sha: if uncommitted {
                String::new()
            } else {
                line.sha.chars().take(7).collect()
            },
            author_name: if uncommitted {
                String::new()
            } else {
                line.author
            },
            author_email: if uncommitted { String::new() } else { line.email },
            time: if uncommitted { 0 } else { line.time },
            summary: if uncommitted { String::new() } else { line.summary },
            start_line: line.final_line,
            lines: 1,
        });
    }
    hunks
}

fn friendly_blame_error(path: &str, detail: &str) -> AppError {
    let lower = detail.to_ascii_lowercase();
    if lower.contains("no such path") || lower.contains("does not exist") {
        return AppError::BlameUnavailable(format!(
            "该版本里没有「{path}」，无法查看 Blame（文件可能已被重命名或删除）"
        ));
    }
    if lower.contains("unknown revision") || lower.contains("bad revision") {
        return AppError::BlameUnavailable(format!("找不到版本，无法查看「{path}」的 Blame"));
    }
    if lower.contains("binary") {
        return AppError::BlameUnavailable(format!("「{path}」是二进制文件，无法 Blame"));
    }
    AppError::BlameUnavailable(format!("读取「{path}」的 Blame 失败：{detail}"))
}

/// Blame one window of lines.
///
/// `rev = None` blames the working-tree file (uncommitted lines come back as
/// `commitSha: None`); a `rev` blames that revision. The CLI is deliberate here:
/// libgit2's `blame_file` always reads the working-directory copy, so blaming an
/// older revision through it would attribute lines of a *different* file version.
pub fn file_blame(
    repo_path: &Path,
    rev: Option<&str>,
    path: &str,
    start_line: Option<usize>,
    end_line: Option<usize>,
) -> Result<BlameWindow, AppError> {
    validate_path(path)?;
    if let Some(rev) = rev {
        validate_rev(rev)?;
    }
    let repo = open_repo(&repo_path.display().to_string())?;

    let total_lines = match rev {
        Some(rev) => rev_line_count(&repo, rev, path),
        None => worktree_line_count(&repo, path),
    };

    let start = start_line.unwrap_or(1).max(1);
    let requested_end = end_line.unwrap_or(start.saturating_add(MAX_BLAME_WINDOW));
    let end = requested_end
        .max(start)
        .min(start.saturating_add(MAX_BLAME_WINDOW - 1));
    let end = match total_lines {
        Some(total) if total > 0 => end.min(total),
        Some(_) => return Ok(empty_window(path, rev, 0, start, end)),
        None => end,
    };
    if let Some(total) = total_lines {
        if start > total {
            return Ok(empty_window(path, rev, total, start, end));
        }
    }

    let range = format!("{start},{end}");
    let mut args: Vec<&str> = vec!["blame", "--line-porcelain", "-L", range.as_str()];
    if let Some(rev) = rev {
        args.push(rev);
    }
    args.push("--");
    args.push(path);

    let output = run_blocking(repo_path, &args).map_err(|error| {
        let detail = match &error {
            AppError::CommandFailed(detail) => detail.clone(),
            other => other.to_string(),
        };
        friendly_blame_error(path, &detail)
    })?;

    let parsed = parse_porcelain(&output.stdout);
    // Content first: `to_hunks` consumes the parsed lines.
    let mut texts = vec![String::new(); end.saturating_sub(start) + 1];
    for line in &parsed {
        if line.final_line >= start && line.final_line <= end {
            texts[line.final_line - start] = line.text.clone();
        }
    }
    let hunks = to_hunks(parsed);
    let total = total_lines.unwrap_or_else(|| {
        hunks
            .last()
            .map(|hunk| hunk.start_line + hunk.lines - 1)
            .unwrap_or(end)
    });

    Ok(BlameWindow {
        path: path.to_string(),
        rev: rev.unwrap_or("HEAD").to_string(),
        total_lines: total,
        start_line: start,
        end_line: end.min(total.max(start)),
        hunks,
        lines: texts,
    })
}

fn empty_window(
    path: &str,
    rev: Option<&str>,
    total: usize,
    start: usize,
    end: usize,
) -> BlameWindow {
    BlameWindow {
        path: path.to_string(),
        rev: rev.unwrap_or("HEAD").to_string(),
        total_lines: total,
        start_line: start,
        // An empty file has no window to load: `endLine` drives the loaded-lines
        // counter in the UI, so it must not claim lines that do not exist.
        end_line: end.min(total),
        hunks: Vec::new(),
        lines: Vec::new(),
    }
}

/// Split `git log` output on the record / field separators, tolerating a leading
/// newline (git prints the first record right after the format's own newline).
fn parse_history(stdout: &str) -> Vec<FileHistoryEntry> {
    let mut entries: Vec<FileHistoryEntry> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for record in stdout.split('\u{1e}') {
        let record = record.trim_matches(|value| value == '\n' || value == '\r');
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split('\u{1f}').collect();
        if fields.len() < 5 {
            continue;
        }
        let sha = fields[0].trim().to_string();
        if sha.len() < 7 || !sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            continue;
        }
        if !seen.insert(sha.clone()) {
            continue;
        }
        entries.push(FileHistoryEntry {
            short_sha: sha.chars().take(7).collect(),
            committed_at: fields[3].trim().parse::<i64>().unwrap_or(0),
            author_name: fields[1].to_string(),
            author_email: parse_mail(fields[2]),
            summary: fields[4].to_string(),
            sha,
        });
    }

    entries
}

fn friendly_history_error(detail: &str) -> AppError {
    let lower = detail.to_ascii_lowercase();
    if lower.contains("does not have any commits") || lower.contains("bad default revision") {
        return AppError::message("仓库还没有任何提交，无法查看文件历史");
    }
    if lower.contains("unknown revision") || lower.contains("bad revision") {
        return AppError::message("找不到该版本，无法查看文件历史");
    }
    AppError::CommandFailed(format!("读取文件历史失败：{detail}"))
}

/// Commits that touched `path`, newest first.
///
/// `--follow` is what makes a rename show up as history instead of "this file
/// starts at the rename". It cannot be combined with `--skip`, so the list is
/// fetched in one bounded request and virtualised in the UI.
pub fn file_history(
    repo_path: &Path,
    rev: Option<&str>,
    path: &str,
    limit: Option<usize>,
) -> Result<FileHistoryPage, AppError> {
    validate_path(path)?;
    if let Some(rev) = rev {
        validate_rev(rev)?;
    }

    let limit = limit.unwrap_or(DEFAULT_HISTORY).clamp(1, MAX_HISTORY);
    let limit_arg = limit.to_string();
    let rev = rev.unwrap_or("HEAD");
    // `:(literal)` keeps `*`, `?` and `[` in a file name from being read as a
    // pathspec glob, which would silently widen the history to other files.
    let pathspec = format!(":(literal){path}");

    let args = [
        "log",
        rev,
        "--follow",
        "-n",
        limit_arg.as_str(),
        "--no-color",
        "--date=unix",
        "--format=%x1e%H%x1f%an%x1f%ae%x1f%at%x1f%s",
        "--",
        pathspec.as_str(),
    ];

    let output = run_blocking(repo_path, &args).map_err(|error| {
        let detail = match &error {
            AppError::CommandFailed(detail) => detail.clone(),
            other => other.to_string(),
        };
        friendly_history_error(&detail)
    })?;

    let entries = parse_history(&output.stdout);
    Ok(FileHistoryPage {
        path: path.to_string(),
        rev: rev.to_string(),
        truncated: entries.len() >= limit,
        follows_renames: true,
        entries,
    })
}