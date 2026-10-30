use std::collections::HashSet;

use git2::{Branch, BranchType, Repository};

use crate::error::AppError;
use crate::model::BranchSummary;

use super::repo::{remote_branch_name, summarize};

/// How many remote branches the panel loads at a time (「加载更多」+this).
pub const REMOTE_BRANCH_PAGE: usize = 10;

/// Remote-tracking ref for a local branch that has no configured upstream —
/// so `↑n ↓n` still works for branches pushed without `-u`.
fn remote_tracking_for(repo: &Repository, branch_name: &str) -> Option<(String, git2::Oid)> {
    let mut remotes: Vec<String> = repo
        .remotes()
        .ok()?
        .iter()
        .flatten()
        .map(str::to_string)
        .collect();
    remotes.sort_by_key(|name| if name == "origin" { 0 } else { 1 });

    for remote in remotes {
        let candidate = format!("refs/remotes/{remote}/{branch_name}");
        if let Ok(oid) = repo.refname_to_id(&candidate) {
            return Some((format!("{remote}/{branch_name}"), oid));
        }
    }
    None
}

fn upstream_info(
    repo: &Repository,
    branch: &mut Branch<'_>,
) -> (Option<String>, Option<usize>, Option<usize>) {
    let local_oid = branch.get().target();

    if let Ok(upstream) = branch.upstream() {
        let upstream_name = upstream
            .get()
            .name()
            .map(|name| name.trim_start_matches("refs/remotes/").to_string());
        let ahead_behind = match (local_oid, upstream.get().target()) {
            (Some(local), Some(remote)) => repo.graph_ahead_behind(local, remote).ok(),
            _ => None,
        };
        return match ahead_behind {
            Some((ahead, behind)) => (upstream_name, Some(ahead), Some(behind)),
            None => (upstream_name, None, None),
        };
    }

    let Some(branch_name) = branch.name().ok().flatten().map(str::to_string) else {
        return (None, None, None);
    };
    let Some((display, remote_oid)) = remote_tracking_for(repo, &branch_name) else {
        return (None, None, None);
    };

    match local_oid.and_then(|local| repo.graph_ahead_behind(local, remote_oid).ok()) {
        Some((ahead, behind)) => (Some(display), Some(ahead), Some(behind)),
        None => (Some(display), None, None),
    }
}

fn local_names(repo: &Repository) -> HashSet<String> {
    repo.branches(Some(BranchType::Local))
        .map(|branches| {
            branches
                .flatten()
                .filter_map(|(branch, _)| branch.name().ok().flatten().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn collect(
    repo: &Repository,
    kind: BranchType,
    locals: &HashSet<String>,
) -> Result<Vec<BranchSummary>, AppError> {
    let mut out = Vec::new();
    for entry in repo.branches(Some(kind))? {
        let (mut branch, _) = entry?;
        let Some(ref_name) = branch.get().name().map(str::to_string) else {
            continue;
        };
        let is_remote = matches!(kind, BranchType::Remote);

        // `refs/remotes/origin/HEAD` is a symbolic alias, not a branch.
        if is_remote && ref_name.ends_with("/HEAD") {
            continue;
        }

        let name = if is_remote {
            ref_name.trim_start_matches("refs/remotes/").to_string()
        } else {
            ref_name.trim_start_matches("refs/heads/").to_string()
        };
        let short_name = if is_remote {
            remote_branch_name(repo, &ref_name)
        } else {
            name.clone()
        };
        let is_head = branch.is_head();
        let last_commit = branch
            .get()
            .peel_to_commit()
            .ok()
            .map(|commit| summarize(&commit));
        let (upstream, ahead, behind) = if is_remote {
            (None, None, None)
        } else {
            upstream_info(repo, &mut branch)
        };

        out.push(BranchSummary {
            ref_name,
            name,
            short_name: short_name.clone(),
            is_head,
            is_remote,
            has_local: if is_remote {
                locals.contains(&short_name)
            } else {
                true
            },
            upstream,
            ahead,
            behind,
            last_commit,
        });
    }
    Ok(out)
}

fn sort_local_first(branches: &mut [BranchSummary]) {
    branches.sort_by(|a, b| {
        b.is_head
            .cmp(&a.is_head)
            .then_with(|| a.is_remote.cmp(&b.is_remote))
            .then_with(|| {
                let a_time = a
                    .last_commit
                    .as_ref()
                    .map_or(0, |commit| commit.committed_at);
                let b_time = b
                    .last_commit
                    .as_ref()
                    .map_or(0, |commit| commit.committed_at);
                b_time.cmp(&a_time)
            })
            .then_with(|| a.name.cmp(&b.name))
    });
}

/// Local branches first (HEAD on top), newest commit first. Remote branches are
/// opt-in so the default view matches GitLab's "active branches" list.
pub fn list_branches(
    repo: &Repository,
    include_remote: bool,
) -> Result<Vec<BranchSummary>, AppError> {
    let locals = local_names(repo);
    let mut branches = collect(repo, BranchType::Local, &locals)?;
    if include_remote {
        branches.extend(collect(repo, BranchType::Remote, &locals)?);
    }
    sort_local_first(&mut branches);
    Ok(branches)
}

/// Newest remote-tracking branches, read from refs already fetched into the
/// repository (no network access, so the panel opens instantly). `offset` lets
/// the UI reveal 10 more at a time.
pub fn list_remote_branches(
    repo: &Repository,
    limit: usize,
    offset: usize,
) -> Result<Vec<BranchSummary>, AppError> {
    let locals = local_names(repo);
    let mut branches = collect(repo, BranchType::Remote, &locals)?;
    branches.sort_by(|a, b| {
        let a_time = a
            .last_commit
            .as_ref()
            .map_or(0, |commit| commit.committed_at);
        let b_time = b
            .last_commit
            .as_ref()
            .map_or(0, |commit| commit.committed_at);
        b_time.cmp(&a_time).then_with(|| a.name.cmp(&b.name))
    });
    let limit = limit.clamp(1, 500);
    Ok(branches.into_iter().skip(offset).take(limit).collect())
}

/// Total remote-tracking branch count, so the UI can say "共 N 条，仅显示最新 50 条".
pub fn count_remote_branches(repo: &Repository) -> Result<usize, AppError> {
    let locals = local_names(repo);
    Ok(collect(repo, BranchType::Remote, &locals)?.len())
}
