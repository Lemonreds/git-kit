use git2::{Repository, Sort};

use crate::error::AppError;
use crate::model::{CommitDetail, CommitPage};

use super::diff::diff_stats;
use super::repo::{resolve_rev, summarize};

pub const DEFAULT_PAGE_SIZE: usize = 50;
pub const MAX_PAGE_SIZE: usize = 200;

fn find_commit<'a>(repo: &'a Repository, sha: &str) -> Result<git2::Commit<'a>, AppError> {
    let oid = resolve_rev(repo, sha).ok_or_else(|| AppError::CommitNotFound(sha.to_string()))?;
    repo.find_commit(oid)
        .map_err(|_| AppError::CommitNotFound(sha.to_string()))
}

pub fn list_commits(
    repo: &Repository,
    rev: &str,
    offset: usize,
    limit: usize,
) -> Result<CommitPage, AppError> {
    let limit = limit.clamp(1, MAX_PAGE_SIZE);
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL)?;

    match resolve_rev(repo, rev) {
        Some(oid) => walk.push(oid)?,
        None => {
            // Unborn HEAD (fresh `git init`) has no commits yet.
            if repo.head().is_err() {
                return Ok(CommitPage {
                    commits: Vec::new(),
                    has_more: false,
                });
            }
            walk.push_head()?;
        }
    }

    let mut commits = Vec::with_capacity(limit.min(64));
    let mut has_more = false;
    for oid in walk.skip(offset) {
        if commits.len() == limit {
            has_more = true;
            break;
        }
        match oid {
            Ok(oid) => match repo.find_commit(oid) {
                Ok(commit) => commits.push(summarize(&commit)),
                Err(_) => continue,
            },
            Err(_) => continue,
        }
    }

    Ok(CommitPage { commits, has_more })
}

pub fn commit_detail(repo: &Repository, sha: &str) -> Result<CommitDetail, AppError> {
    let commit = find_commit(repo, sha)?;
    let (files_changed, additions, deletions) = diff_stats(repo, &commit)?;
    let author = commit.author();
    let parents: Vec<String> = commit.parent_ids().map(|id| id.to_string()).collect();

    Ok(CommitDetail {
        sha: commit.id().to_string(),
        short_sha: super::repo::short_id(&commit),
        summary: commit.summary().unwrap_or("(无提交说明)").to_string(),
        message: commit.message().unwrap_or_default().to_string(),
        author_name: author.name().unwrap_or("未知作者").to_string(),
        author_email: author.email().unwrap_or_default().to_string(),
        committed_at: commit.time().seconds(),
        is_merge: parents.len() > 1,
        parents,
        files_changed,
        additions,
        deletions,
    })
}
