import { t } from "./index";
import type { MessageKey } from "./index";

/**
 * Backend error codes that have a curated, static message. Everything else
 * (`message`, `command_failed`, `git_error`, `terminal`, unknown codes) keeps
 * the raw backend text, because it carries the concrete git output.
 */
const ERROR_KEYS: Record<string, MessageKey> = {
  not_found: "errors.not_found",
  not_a_repo: "errors.not_a_repo",
  permission_denied: "errors.permission_denied",
  commit_not_found: "errors.commit_not_found",
  file_not_changed: "errors.file_not_changed",
  dirty_worktree: "errors.dirty_worktree",
  cherry_pick_conflict: "errors.cherry_pick_conflict",
  pull_conflict: "errors.pull_conflict",
  rebase_conflict: "errors.rebase_conflict",
  merge_conflict: "errors.merge_conflict",
  revert_conflict: "errors.revert_conflict",
  stash_conflict: "errors.stash_conflict",
  remote_invalid: "errors.remote_invalid",
  config_invalid: "errors.config_invalid",
  push_rejected: "errors.push_rejected",
  branch_invalid: "errors.branch_invalid",
  git_not_found: "errors.git_not_found",
  git_auth: "errors.git_auth",
  git_exists: "errors.git_exists",
  git_invalid: "errors.git_invalid",
  git_bare_repo: "errors.git_bare_repo",
  git_unborn_branch: "errors.git_unborn_branch",
  io: "errors.io",
  serde: "errors.serde",
};

/** Localized text for a backend error code, or `fallback` when unknown. */
export function translateError(code: string, fallback: string): string {
  const key = ERROR_KEYS[code];
  return key === undefined ? fallback : t(key);
}