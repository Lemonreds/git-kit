use std::fs;
use std::path::Path;
use std::process::Command;

use git2::{Oid, Repository};
use tempfile::TempDir;

use crate::git::{branches, commits, diff, ops, repo as git_repo};

fn init_repo() -> (TempDir, Repository) {
    let dir = tempfile::tempdir().expect("tempdir");
    let repo = Repository::init(dir.path()).expect("init repo");
    {
        let mut config = repo.config().expect("config");
        config.set_str("user.name", "Test User").expect("name");
        config
            .set_str("user.email", "test@example.com")
            .expect("email");
    }
    (dir, repo)
}

fn stage_file(repo: &Repository, name: &str, content: &str) {
    let workdir = repo.workdir().expect("workdir");
    fs::create_dir_all(workdir.join(Path::new(name)).parent().unwrap()).ok();
    fs::write(workdir.join(name), content).expect("write file");
    let mut index = repo.index().expect("index");
    index.add_path(Path::new(name)).expect("add path");
    index.write().expect("write index");
}

fn commit(repo: &Repository, message: &str) -> Oid {
    let mut index = repo.index().expect("index");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("find tree");
    let signature = repo.signature().expect("signature");
    let parent = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        message,
        &tree,
        &parents,
    )
    .expect("commit")
}

fn workspace() -> (TempDir, Repository) {
    let (dir, repo) = init_repo();
    stage_file(&repo, "README.md", "hello\n");
    commit(&repo, "chore: init");
    (dir, repo)
}

#[test]
fn unborn_repository_lists_no_commits() {
    let (_dir, repo) = init_repo();
    let page = commits::list_commits(&repo, "HEAD", 0, 50).expect("list commits");
    assert!(page.commits.is_empty());
    assert!(!page.has_more);
    assert!(branches::list_branches(&repo, false).unwrap().is_empty());
}

#[test]
fn branches_put_head_first_with_latest_commit() {
    let (_dir, repo) = workspace();
    let _branch = repo.branch(
        "feature/login",
        &repo.head().unwrap().peel_to_commit().unwrap(),
        true,
    );

    stage_file(&repo, "src/main.rs", "fn main() {}\n");
    commit(&repo, "feat: add main");

    let list = branches::list_branches(&repo, false).expect("branches");
    let head_name = git_repo::head_branch(&repo).expect("head branch");
    assert_eq!(list.len(), 2);
    assert!(list[0].is_head);
    assert_eq!(list[0].name, head_name);
    assert_eq!(
        list[0].last_commit.as_ref().unwrap().summary,
        "feat: add main"
    );
    assert!(list.iter().any(|branch| branch.name == "feature/login"));
}

#[test]
fn commits_paginate_and_load_more() {
    let (_dir, repo) = workspace();
    for index in 0..3 {
        stage_file(&repo, &format!("file-{index}.txt"), "x\n");
        commit(&repo, &format!("commit {index}"));
    }

    let first = commits::list_commits(&repo, "HEAD", 0, 2).expect("page 1");
    assert_eq!(first.commits.len(), 2);
    assert!(first.has_more);
    assert_eq!(first.commits[0].summary, "commit 2");

    let second = commits::list_commits(&repo, "HEAD", 2, 2).expect("page 2");
    assert_eq!(second.commits.len(), 2);
    assert!(!second.has_more);
}

#[test]
fn commit_files_and_patch_for_modified_file() {
    let (_dir, repo) = workspace();
    stage_file(&repo, "README.md", "hello\nworld\n");
    stage_file(
        &repo,
        "src/lib.rs",
        "pub fn add(a: i32, b: i32) -> i32 { a + b }\n",
    );
    let sha = commit(&repo, "feat: extend readme");

    let head = repo.find_commit(sha).expect("commit");
    let files = diff::commit_files(&repo, &head).expect("files");
    let readme = files.iter().find(|file| file.path == "README.md").unwrap();
    assert_eq!(readme.additions, 1);
    assert_eq!(readme.deletions, 0);
    let added = files.iter().find(|file| file.path == "src/lib.rs").unwrap();
    assert_eq!(added.status, crate::model::FileStatus::Added);

    let patch = diff::file_diff(&repo, &head, "README.md", None, 3).expect("patch");
    assert!(patch.patch.contains("@@ -1 +1,2 @@"));
    assert!(patch.patch.contains("+world"));
    assert!(!patch.truncated);
}

#[test]
fn initial_commit_diffs_against_empty_tree() {
    let (_dir, repo) = workspace();
    let head = repo.head().unwrap().peel_to_commit().unwrap();
    let files = diff::commit_files(&repo, &head).expect("files");
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].status, crate::model::FileStatus::Added);
    assert_eq!(files[0].additions, 1);
}

#[test]
fn commit_detail_reports_stats_and_merge_flag() {
    let (_dir, repo) = workspace();
    stage_file(&repo, "README.md", "hello\nagain\n");
    let sha = commit(&repo, "docs: update");
    let detail = commits::commit_detail(&repo, &sha.to_string()).expect("detail");
    assert_eq!(detail.files_changed, 1);
    assert_eq!(detail.additions, 1);
    assert_eq!(detail.deletions, 0);
    assert!(!detail.is_merge);
    assert_eq!(detail.author_email, "test@example.com");
}

#[test]
fn missing_file_is_reported_not_panicked() {
    let (_dir, repo) = workspace();
    let head = repo.head().unwrap().peel_to_commit().unwrap();
    let error = diff::file_diff(&repo, &head, "nope.txt", None, 3).unwrap_err();
    assert_eq!(error.code(), "file_not_changed");
}

#[test]
fn remote_url_is_normalized_for_footer() {
    let (_dir, repo) = workspace();
    repo.remote("origin", "git@github.com:acme/git-kit.git")
        .expect("remote");
    assert_eq!(
        git_repo::remote_url(&repo).as_deref(),
        Some("github.com/acme/git-kit")
    );

    let snapshot = git_repo::snapshot(&repo, repo.workdir().unwrap());
    assert_eq!(snapshot.head_branch, git_repo::head_branch(&repo));
    assert_eq!(
        snapshot.name,
        repo.workdir()
            .unwrap()
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
    );
}

#[test]
fn non_repository_folder_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let error = match git_repo::open_repo(dir.path().to_str().unwrap()) {
        Ok(_) => panic!("expected a not_a_repo error"),
        Err(error) => error,
    };
    assert_eq!(error.code(), "not_a_repo");
}

#[test]
fn detached_head_is_reported_with_short_sha() {
    let (_dir, repo) = workspace();
    let head = repo.head().unwrap().peel_to_commit().unwrap();
    repo.set_head_detached(head.id()).unwrap();
    let branch = git_repo::head_branch(&repo).expect("branch");
    assert!(branch.starts_with("detached@"));
}

/// `delete_remote = false` keeps the remote branch, `true` removes it with
/// `git push --delete` and prunes the tracking ref.
#[test]
fn delete_branches_optionally_removes_the_remote_ref() {
    let (dir, repo) = workspace();
    let remote_dir = tempfile::tempdir().expect("remote dir");
    Repository::init_bare(remote_dir.path()).expect("init bare remote");
    repo.remote("origin", remote_dir.path().to_str().unwrap())
        .expect("remote");

    let head = repo.head().unwrap().peel_to_commit().unwrap();
    repo.branch("feature", &head, false).expect("branch");

    let git = |args: &[&str]| {
        let output = Command::new("git")
            .arg("-C")
            .arg(dir.path())
            .args(args)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    };
    git(&["push", "-u", "origin", "HEAD"]);
    git(&["push", "-u", "origin", "feature"]);

    let remote_repo = Repository::open(remote_dir.path()).expect("open bare remote");
    assert!(remote_repo.find_reference("refs/heads/feature").is_ok());

    // Local-only deletion keeps the remote branch.
    let local_only = ops::delete_branches(dir.path(), &["feature".to_string()], false, false)
        .expect("delete local");
    assert_eq!(local_only.deleted, vec!["feature".to_string()]);
    assert!(local_only.remote_deleted.is_empty());
    assert!(local_only.remote_failed.is_empty());
    assert!(remote_repo.find_reference("refs/heads/feature").is_ok());

    // Re-create, then delete both sides in one call.
    repo.branch("feature", &head, false).expect("re-branch");
    git(&["push", "-u", "origin", "feature"]);
    let both = ops::delete_branches(dir.path(), &["feature".to_string()], false, true)
        .expect("delete local and remote");
    assert_eq!(both.deleted, vec!["feature".to_string()]);
    assert_eq!(both.remote_deleted, vec!["origin/feature".to_string()]);
    assert!(both.remote_failed.is_empty());

    let remote_repo = Repository::open(remote_dir.path()).expect("reopen bare remote");
    assert!(remote_repo.find_reference("refs/heads/feature").is_err());
    assert!(repo.find_branch("feature", git2::BranchType::Local).is_err());
}

/// A branch that was never pushed is not an error: the remote has no such ref.
#[test]
fn delete_remote_skips_branches_that_were_never_pushed() {
    let (dir, repo) = workspace();
    let remote_dir = tempfile::tempdir().expect("remote dir");
    Repository::init_bare(remote_dir.path()).expect("init bare remote");
    repo.remote("origin", remote_dir.path().to_str().unwrap())
        .expect("remote");

    let head = repo.head().unwrap().peel_to_commit().unwrap();
    repo.branch("local-only", &head, false).expect("branch");

    let result = ops::delete_branches(dir.path(), &["local-only".to_string()], false, true)
        .expect("delete local with remote flag");
    assert_eq!(result.deleted, vec!["local-only".to_string()]);
    assert!(result.remote_deleted.is_empty());
    assert!(result.remote_failed.is_empty());
}
