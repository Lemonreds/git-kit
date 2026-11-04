use std::fs;
use std::path::Path;
use std::process::Command;

use git2::{Oid, Repository};
use tempfile::TempDir;

use crate::git::{
    branches, commits, conflict, diff, history, hooks, ops, repo as git_repo, status, workflow,
};
use crate::model::{ConflictKind, FileStatus};

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

/// Unstaging everything must not fail on an empty pathspec list: tracked files
/// return to their HEAD state and new files stay on disk as untracked.
#[test]
fn unstage_all_restores_head_state_for_every_path() {
    let (dir, repo) = workspace();
    stage_file(&repo, "src/main.rs", "fn main() {}\n");

    let status = status::worktree_status(&repo).expect("status after staging");
    assert_eq!(status.staged_count, 1);
    assert_eq!(status.unstaged_count, 0);

    status::unstage_all(&repo).expect("unstage all");

    let status = status::worktree_status(&repo).expect("status after unstaging");
    assert_eq!(status.staged_count, 0);
    assert_eq!(status.entries.len(), 1);
    assert_eq!(status.entries[0].path, "src/main.rs");
    assert_eq!(status.entries[0].unstaged, Some(FileStatus::Untracked));
    assert!(dir.path().join("src/main.rs").is_file());

    // Running it twice (index already matches HEAD) stays a no-op.
    status::unstage_all(&repo).expect("unstage all again");
}

/// Discarding everything restores tracked files and deletes untracked leftovers.
#[test]
fn discard_all_resets_worktree_and_drops_untracked_files() {
    let (dir, repo) = workspace();
    fs::write(dir.path().join("README.md"), "changed\n").expect("modify tracked");
    stage_file(&repo, "notes/todo.md", "todo\n");
    fs::write(dir.path().join("scratch.txt"), "scratch\n").expect("untracked");

    status::discard_all(&repo).expect("discard all");

    assert_eq!(
        fs::read_to_string(dir.path().join("README.md")).expect("read readme"),
        "hello\n"
    );
    assert!(!dir.path().join("notes/todo.md").exists());
    assert!(!dir.path().join("scratch.txt").exists());
    let status = status::worktree_status(&repo).expect("status after discard");
    assert!(status.entries.is_empty());
}

/// Staging everything picks up modifications, deletions and nested untracked files.
#[test]
fn stage_all_includes_nested_untracked_files() {
    let (dir, repo) = workspace();
    fs::write(dir.path().join("README.md"), "changed\n").expect("modify tracked");
    fs::create_dir_all(dir.path().join("src/deep")).expect("mkdir");
    fs::write(dir.path().join("src/deep/new.rs"), "fn a() {}\n").expect("new file");

    status::stage_all(&repo).expect("stage all");

    let status = status::worktree_status(&repo).expect("status after stage");
    assert_eq!(status.staged_count, 2);
    assert_eq!(status.unstaged_count, 0);
    assert!(status.entries.iter().all(|entry| entry.staged.is_some()));
}

// ---------------------------------------------------------------------------
// Squash: base detection and the count ceiling
// ---------------------------------------------------------------------------

/// Repo whose default branch is `wip`, so the trunk refs stay free for the test.
fn workspace_on(head: &str) -> (TempDir, Repository) {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut options = git2::RepositoryInitOptions::new();
    options.initial_head(head);
    let repo = Repository::init_opts(dir.path(), &options).expect("init repo");
    {
        let mut config = repo.config().expect("config");
        config.set_str("user.name", "Test User").expect("name");
        config
            .set_str("user.email", "test@example.com")
            .expect("email");
    }
    (dir, repo)
}

fn checkout(repo: &Repository, branch: &str) {
    repo.set_head(&format!("refs/heads/{branch}")).expect("set head");
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .expect("checkout");
}

fn set_ref(repo: &Repository, name: &str, oid: Oid) {
    repo.reference(name, oid, true, "test").expect("set ref");
}

/// A branch cut from a freshly fetched `origin/main` must not be measured
/// against a stale local `main`, otherwise every recommended squash count is
/// inflated by however far the local trunk lags behind.
#[test]
fn squash_preview_measures_from_the_closest_trunk() {
    let (_dir, repo) = workspace_on("wip");

    stage_file(&repo, "a.txt", "a\n");
    let a = commit(&repo, "a");
    set_ref(&repo, "refs/heads/main", a);
    set_ref(&repo, "refs/remotes/origin/main", a);

    stage_file(&repo, "b.txt", "b\n");
    let b = commit(&repo, "b");
    set_ref(&repo, "refs/remotes/origin/main", b);

    repo.branch("feature", &repo.find_commit(b).expect("b"), false)
        .expect("branch");
    checkout(&repo, "feature");
    stage_file(&repo, "c.txt", "c\n");
    commit(&repo, "c");
    stage_file(&repo, "d.txt", "d\n");
    commit(&repo, "d");

    let preview = ops::squash_preview(&repo, "feature").expect("preview");

    assert_eq!(preview.base_branch.as_deref(), Some("origin/main"));
    assert_eq!(preview.count, 2, "only the branch's own commits count");
    assert_eq!(preview.total_commits, 4);
    assert_eq!(preview.commits.len(), 2);
    assert_eq!(preview.oldest_message.as_deref(), Some("c"));
}

/// Squashing on the trunk itself has nothing to measure: the answer is zero
/// rather than "every commit in the repository".
#[test]
fn squash_preview_on_the_trunk_reports_nothing_to_squash() {
    let (_dir, repo) = workspace_on("wip");

    stage_file(&repo, "a.txt", "a\n");
    let a = commit(&repo, "a");
    set_ref(&repo, "refs/heads/main", a);
    set_ref(&repo, "refs/remotes/origin/main", a);
    checkout(&repo, "main");

    let preview = ops::squash_preview(&repo, "main").expect("preview");

    assert_eq!(preview.base_branch.as_deref(), Some("origin/main"));
    assert_eq!(preview.count, 0);
    assert!(preview.commits.is_empty());
}

/// `reset --soft HEAD~N` needs a commit to reset to, so folding *every* commit
/// away has to fail with an explanation instead of a raw git error.
#[test]
fn squash_rejects_folding_every_commit() {
    let (dir, repo) = workspace_on("main");
    stage_file(&repo, "a.txt", "a\n");
    commit(&repo, "a");

    let error = ops::squash_commits(dir.path(), "main", 1, "one")
        .expect_err("a single commit cannot be squashed");
    assert!(error.to_string().contains("最多可压缩 0 个"), "{error}");

    stage_file(&repo, "b.txt", "b\n");
    commit(&repo, "b");
    stage_file(&repo, "c.txt", "c\n");
    commit(&repo, "c");

    let error = ops::squash_commits(dir.path(), "main", 3, "all three")
        .expect_err("the oldest commit must survive");
    assert!(error.to_string().contains("最多可压缩 2 个"), "{error}");

    let result = ops::squash_commits(dir.path(), "main", 2, "b + c").expect("squash two");
    assert_eq!(result.squashed, 2);
    let log = ops::squash_preview(&repo, "main").expect("preview");
    assert_eq!(log.total_commits, 2, "3 commits folded into a + one");
}

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

/// Lightweight and annotated tags must both report the peeled commit: the row
/// shows its summary, and a lightweight tag borrows the commit time so it does
/// not sink below every annotated tag in the list.
#[test]
fn tags_report_annotation_commit_summary_and_time() {
    let (dir, repo) = workspace();
    stage_file(&repo, "README.md", "hello\nworld\n");
    let sha = commit(&repo, "feat: second commit");

    let head = repo.find_commit(sha).expect("head commit");
    let head_object = head.as_object();
    repo.tag_lightweight("v1", head_object, false)
        .expect("lightweight tag");

    let annotated_tagger_time = 1_600_000_000;
    let tagger = git2::Signature::new(
        "Test",
        "test@example.com",
        &git2::Time::new(annotated_tagger_time, 0),
    )
    .expect("signature");
    repo.tag("v2", head_object, &tagger, "release 2", false)
        .expect("annotated tag");

    let tags = workflow::list_tags(&repo).expect("list tags");
    assert_eq!(tags.len(), 2);

    let lightweight = tags.iter().find(|tag| tag.name == "v1").expect("v1");
    assert!(!lightweight.annotated);
    assert_eq!(lightweight.sha, sha.to_string());
    assert_eq!(
        lightweight.commit_summary.as_deref(),
        Some("feat: second commit")
    );
    assert!(
        lightweight.created_at.is_some(),
        "commit time stands in for the tagger time"
    );

    let annotated = tags.iter().find(|tag| tag.name == "v2").expect("v2");
    assert!(annotated.annotated);
    assert_eq!(annotated.message.as_deref(), Some("release 2"));
    assert_eq!(
        annotated.commit_summary.as_deref(),
        Some("feat: second commit")
    );

    // A lightweight tag borrows the commit time, an annotated one keeps its own.
    assert_eq!(lightweight.created_at, Some(head.time().seconds()));
    assert_eq!(annotated.created_at, Some(annotated_tagger_time));
    assert_eq!(annotated.commit_time, Some(head.time().seconds()));
    assert!(dir.path().join("README.md").is_file());
}

/// The remote comparison reads `git ls-remote --tags`, so annotated tags have to
/// come back as their peeled commit — not as the tag object id.
#[test]
fn remote_tag_list_peels_annotated_tags() {
    let (dir, repo) = workspace();
    let remote_dir = tempfile::tempdir().expect("remote dir");
    Repository::init_bare(remote_dir.path()).expect("init bare remote");
    repo.remote("origin", remote_dir.path().to_str().unwrap())
        .expect("remote");

    let head = repo.head().unwrap().peel_to_commit().unwrap();
    let head_object = head.as_object();
    repo.tag_lightweight("v1.0.0", head_object, false)
        .expect("lightweight tag");
    let tagger = git2::Signature::now("Test", "test@example.com").expect("signature");
    repo.tag("v1.1.0", head_object, &tagger, "release 1.1", false)
        .expect("annotated tag");

    let output = Command::new("git")
        .arg("-C")
        .arg(dir.path())
        .args(["push", "origin", "--tags"])
        .output()
        .expect("run git push");
    assert!(
        output.status.success(),
        "git push --tags failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let page = workflow::list_remote_tags(dir.path()).expect("remote tags");
    assert_eq!(page.remote.as_deref(), Some("origin"));
    assert!(page.failure.is_none(), "{:?}", page.failure);

    let mut names: Vec<&str> = page.tags.iter().map(|tag| tag.name.as_str()).collect();
    names.sort_unstable();
    assert_eq!(names, vec!["v1.0.0", "v1.1.0"]);
    for tag in &page.tags {
        assert_eq!(
            tag.sha,
            head.id().to_string(),
            "{} must peel to the commit",
            tag.name
        );
    }
}

/// No remote is a normal state: an empty page with `remote == None`, not an error.
#[test]
fn remote_tag_list_without_a_remote_is_empty() {
    let (dir, _repo) = workspace();
    let page = workflow::list_remote_tags(dir.path()).expect("remote tags");
    assert!(page.remote.is_none());
    assert!(page.tags.is_empty());
    assert!(page.failure.is_none());
}

// --- conflict resolution ----------------------------------------------------

fn git_ok(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .expect("run git");
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Two branches edit the same lines of README.md, then a merge is left
/// conflicted — the exact state the resolver has to handle.
fn conflicted_workspace() -> (TempDir, Repository) {
    let (dir, repo) = workspace();
    let head = repo.head().unwrap().shorthand().unwrap().to_string();

    stage_file(&repo, "README.md", "hello\nmine\n");
    commit(&repo, "feat: mine");

    git_ok(dir.path(), &["checkout", "-b", "side", "HEAD~1"]);
    let repo = Repository::open(dir.path()).expect("reopen");
    stage_file(&repo, "README.md", "hello\ntheirs\n");
    commit(&repo, "feat: theirs");

    git_ok(dir.path(), &["checkout", &head]);
    let output = Command::new("git")
        .arg("-C")
        .arg(dir.path())
        .args(["merge", "--no-edit", "side"])
        .output()
        .expect("run merge");
    assert!(!output.status.success(), "the merge must stop on a conflict");

    let repo = Repository::open(dir.path()).expect("reopen after merge");
    (dir, repo)
}

#[test]
fn conflicts_are_listed_with_their_three_stages() {
    let (_dir, repo) = conflicted_workspace();
    let files = conflict::list_conflicts(&repo).expect("list conflicts");
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, "README.md");
    assert_eq!(files[0].kind, ConflictKind::BothModified);
    assert!(files[0].has_base && files[0].has_ours && files[0].has_theirs);

    let detail = conflict::conflict_file(&repo, "README.md").expect("conflict detail");
    assert!(detail.ours.text.as_deref().unwrap_or_default().contains("mine"));
    assert!(detail.theirs.text.as_deref().unwrap_or_default().contains("theirs"));
    assert!(detail.base.text.is_some());
    assert_eq!(detail.eol, "lf");
    assert!(detail.complete && !detail.truncated);
    let worktree = detail.worktree_text.unwrap_or_default();
    assert!(worktree.contains("<<<<<<<"), "worktree keeps the markers");

    // The status banner and the resolver share one index walk.
    assert_eq!(workflow::repo_state(&repo).conflicts, vec!["README.md"]);
}

#[test]
fn resolve_conflict_writes_the_file_and_stages_it() {
    let (dir, _repo) = conflicted_workspace();
    let state = conflict::resolve_conflict(dir.path(), "README.md", "hello\nmine\ntheirs\n")
        .expect("resolve");
    assert!(state.conflicts.is_empty());
    assert_eq!(state.kind, "merge", "the merge itself is still in progress");

    assert_eq!(
        fs::read_to_string(dir.path().join("README.md")).expect("read"),
        "hello\nmine\ntheirs\n"
    );

    let repo = Repository::open(dir.path()).expect("reopen");
    let index = repo.index().expect("index");
    assert!(index.conflicts().expect("conflicts").next().is_none());
    let entry = index.get_path(Path::new("README.md"), 0).expect("staged entry");
    let blob = repo.find_blob(entry.id).expect("blob");
    assert_eq!(blob.content(), b"hello\nmine\ntheirs\n");
}

#[test]
fn resolve_conflict_rejects_paths_that_are_not_conflicted() {
    let (dir, _repo) = conflicted_workspace();
    let error = conflict::resolve_conflict(dir.path(), "src/other.rs", "x").expect_err("rejected");
    assert_eq!(error.code(), "conflict_invalid");

    let error = conflict::resolve_conflict(dir.path(), "../escape.txt", "x").expect_err("rejected");
    assert_eq!(error.code(), "conflict_invalid");
}

#[test]
fn resolve_conflict_side_takes_one_whole_version() {
    let (dir, _repo) = conflicted_workspace();
    let state = conflict::resolve_conflict_side(dir.path(), "README.md", "theirs").expect("theirs");
    assert!(state.conflicts.is_empty());
    assert_eq!(
        fs::read_to_string(dir.path().join("README.md")).expect("read"),
        "hello\ntheirs\n"
    );
}

// --- blame / file history ---------------------------------------------------

#[test]
fn blame_attributes_lines_to_the_commit_that_changed_them() {
    let (dir, repo) = workspace();
    stage_file(&repo, "src/a.rs", "one\ntwo\n");
    let first = commit(&repo, "feat: first");
    stage_file(&repo, "src/a.rs", "one changed\ntwo\nthree\n");
    let second = commit(&repo, "feat: second");

    let window = history::file_blame(dir.path(), None, "src/a.rs", Some(1), Some(3))
        .expect("blame worktree");
    assert_eq!(window.total_lines, 3);
    assert_eq!(window.lines, vec!["one changed", "two", "three"]);

    let line = |start: usize| {
        window
            .hunks
            .iter()
            .find(|hunk| hunk.start_line <= start && start < hunk.start_line + hunk.lines)
            .expect("hunk covering the line")
    };
    assert_eq!(line(1).commit_sha.as_deref(), Some(second.to_string().as_str()));
    assert_eq!(line(2).commit_sha.as_deref(), Some(first.to_string().as_str()));
    assert_eq!(line(3).commit_sha.as_deref(), Some(second.to_string().as_str()));

    // Uncommitted lines come back without a commit instead of being misattributed.
    fs::write(dir.path().join("src/a.rs"), "one changed\ntwo\nthree\nfour\n").expect("write");
    let window = history::file_blame(dir.path(), None, "src/a.rs", Some(3), Some(4))
        .expect("blame uncommitted");
    assert_eq!(window.total_lines, 4);
    let last = window
        .hunks
        .iter()
        .find(|hunk| hunk.start_line + hunk.lines - 1 >= 4)
        .expect("hunk for the uncommitted line");
    assert!(last.commit_sha.is_none());
    assert!(last.short_sha.is_empty());
}

#[test]
fn blame_at_an_old_revision_uses_that_revision() {
    let (dir, repo) = workspace();
    stage_file(&repo, "src/a.rs", "one\ntwo\n");
    let first = commit(&repo, "feat: first");
    stage_file(&repo, "src/a.rs", "one\ntwo\nthree\n");
    commit(&repo, "feat: second");

    let window = history::file_blame(dir.path(), Some(&first.to_string()), "src/a.rs", None, None)
        .expect("blame a revision");
    assert_eq!(window.total_lines, 2);
    assert!(window
        .hunks
        .iter()
        .all(|hunk| hunk.commit_sha.as_deref() == Some(first.to_string().as_str())));
}

#[test]
fn file_history_follows_renames() {
    let (dir, repo) = workspace();
    stage_file(&repo, "src/a.rs", "one\n");
    commit(&repo, "feat: add a");
    stage_file(&repo, "src/a.rs", "one\ntwo\n");
    commit(&repo, "feat: grow a");

    let page = history::file_history(dir.path(), None, "src/a.rs", Some(20)).expect("history");
    assert_eq!(page.entries.len(), 2);
    assert!(page.entries[0].summary.contains("grow a"));
    assert!(page.follows_renames);

    git_ok(dir.path(), &["mv", "src/a.rs", "src/b.rs"]);
    git_ok(dir.path(), &["commit", "-m", "refactor: rename a to b"]);

    let page = history::file_history(dir.path(), None, "src/b.rs", Some(20)).expect("renamed");
    assert_eq!(page.entries.len(), 3, "--follow must walk through the rename");
    assert!(page.entries[2].summary.contains("add a"));
}

#[test]
fn file_history_of_an_untouched_path_is_empty() {
    let (dir, _repo) = workspace();
    let page = history::file_history(dir.path(), None, "nope.md", Some(20)).expect("history");
    assert!(page.entries.is_empty());
    assert!(!page.truncated);
}

// ---------------------------------------------------------------------------
// Merged branch cleanup + hooks
// ---------------------------------------------------------------------------

fn commit_on(repo: &Repository, refname: &str, message: &str, parent: Oid) -> Oid {
    let parent = repo.find_commit(parent).expect("parent");
    let tree = parent.tree().expect("tree");
    let signature = repo.signature().expect("signature");
    repo.commit(Some(refname), &signature, &signature, message, &tree, &[&parent])
        .expect("commit on ref")
}

#[test]
fn merged_branches_splits_contained_from_unmerged() {
    let (_dir, repo) = workspace();
    let head = repo.head().expect("head").target().expect("oid");

    // `merged-one` stays behind while HEAD advances: its tip is contained.
    set_ref(&repo, "refs/heads/merged-one", head);
    stage_file(&repo, "b.txt", "b\n");
    let new_head = commit(&repo, "feat: advance");
    // `unmerged-one` carries a commit HEAD does not have.
    let dangling = commit_on(&repo, "refs/heads/unmerged-one", "feat: wip", new_head);

    let list = branches::merged_branches(&repo).expect("merged");
    let names: Vec<&str> = list.branches.iter().map(|branch| branch.name.as_str()).collect();
    assert!(names.contains(&"merged-one"));
    assert!(!names.contains(&"unmerged-one"));
    assert!(
        list.branches
            .iter()
            .all(|branch| branch.commit.sha != dangling.to_string()),
        "a branch with unmerged commits must not be listed"
    );
    assert!(!list.base.is_empty());
}

#[test]
fn hooks_round_trip_enable_and_delete() {
    let (dir, _repo) = workspace();
    let repo_path = dir.path();

    // libgit2 does not install git's hook templates, write one by hand.
    let hooks_dir = repo_path.join(".git").join("hooks");
    fs::create_dir_all(&hooks_dir).expect("hooks dir");
    fs::write(hooks_dir.join("pre-commit.sample"), "#!/bin/sh\nexit 0\n").expect("sample");

    let listed = hooks::list_hooks(repo_path).expect("list");
    let pre = listed
        .iter()
        .find(|hook| hook.name == "pre-commit")
        .expect("pre-commit is always listed");
    assert!(!pre.present);
    assert!(pre.has_sample);

    // Reading a hook that does not exist yet falls back to the sample.
    let content = hooks::read_hook(repo_path, "pre-commit").expect("read");
    assert!(content.contains("exit 0"));

    hooks::write_hook(repo_path, "pre-commit", "#!/bin/sh\nexit 0\n", true).expect("write");
    let after = hooks::list_hooks(repo_path).expect("list again");
    let pre = after.iter().find(|hook| hook.name == "pre-commit").expect("listed");
    assert!(pre.present);
    assert!(pre.enabled);

    hooks::set_hook_enabled(repo_path, "pre-commit", false).expect("disable");
    let disabled = hooks::list_hooks(repo_path).expect("list disabled");
    let pre = disabled.iter().find(|hook| hook.name == "pre-commit").expect("listed");
    assert!(pre.present);
    assert!(!pre.enabled);

    // Names that would escape the hooks directory are refused.
    assert!(hooks::write_hook(repo_path, "../evil", "x", true).is_err());
    assert!(hooks::delete_hook(repo_path, "a/b").is_err());

    hooks::delete_hook(repo_path, "pre-commit").expect("delete");
    let gone = hooks::list_hooks(repo_path).expect("list gone");
    let pre = gone.iter().find(|hook| hook.name == "pre-commit").expect("listed");
    assert!(!pre.present);
    assert!(pre.has_sample, "the .sample template must survive a delete");
}
