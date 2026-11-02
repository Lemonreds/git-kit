import type { Message } from "../types";

/**
 * Static `AppError` codes from Rust. The backend message carries the concrete
 * detail (path, ref, git output); these lines are deliberately generic so they
 * can never claim something that is not true. Codes whose message is dynamic
 * (`message`, `command_failed`, `git_error`, `terminal`) are intentionally
 * missing: those keep the raw backend text.
 */
export const zh = {
  "errors.not_found": "找不到请求的文件或路径",
  "errors.not_a_repo": "该文件夹不是 Git 仓库",
  "errors.permission_denied": "没有访问权限",
  "errors.commit_not_found": "找不到该提交",
  "errors.file_not_changed": "该文件没有改动",
  "errors.dirty_worktree": "工作区还有未提交的改动",
  "errors.cherry_pick_conflict": "cherry-pick 出现冲突，需要手动解决",
  "errors.pull_conflict": "拉取出现冲突，需要手动解决",
  "errors.rebase_conflict": "rebase 出现冲突，需要手动解决",
  "errors.merge_conflict": "合并出现冲突，需要手动解决",
  "errors.revert_conflict": "撤销提交出现冲突，需要手动解决",
  "errors.stash_conflict": "恢复暂存出现冲突，需要手动解决",
  "errors.remote_invalid": "远程仓库地址无效",
  "errors.config_invalid": "配置无效",
  "errors.push_rejected": "远程拒绝了这次推送",
  "errors.branch_invalid": "分支名无效",
  "errors.git_not_found": "找不到对应的 Git 对象或引用",
  "errors.git_auth": "Git 认证失败",
  "errors.git_exists": "目标已经存在",
  "errors.git_invalid": "Git 操作无效",
  "errors.git_bare_repo": "该仓库是裸仓库（bare repository）",
  "errors.git_unborn_branch": "该分支还没有任何提交",
  "errors.io": "文件读写失败",
  "errors.serde": "数据格式错误",
} satisfies Record<string, Message>;

export const en: Record<keyof typeof zh, Message> = {
  "errors.not_found": "The requested file or path could not be found",
  "errors.not_a_repo": "This folder is not a Git repository",
  "errors.permission_denied": "Permission denied",
  "errors.commit_not_found": "The commit could not be found",
  "errors.file_not_changed": "This file has no changes",
  "errors.dirty_worktree": "The working tree still has uncommitted changes",
  "errors.cherry_pick_conflict":
    "The cherry-pick stopped on a conflict that has to be resolved by hand",
  "errors.pull_conflict": "The pull stopped on a conflict that has to be resolved by hand",
  "errors.rebase_conflict": "The rebase stopped on a conflict that has to be resolved by hand",
  "errors.merge_conflict": "The merge stopped on a conflict that has to be resolved by hand",
  "errors.revert_conflict": "The revert stopped on a conflict that has to be resolved by hand",
  "errors.stash_conflict":
    "Restoring the stash stopped on a conflict that has to be resolved by hand",
  "errors.remote_invalid": "The remote repository address is invalid",
  "errors.config_invalid": "The configuration is invalid",
  "errors.push_rejected": "The remote rejected this push",
  "errors.branch_invalid": "The branch name is invalid",
  "errors.git_not_found": "The Git object or reference could not be found",
  "errors.git_auth": "Git authentication failed",
  "errors.git_exists": "The target already exists",
  "errors.git_invalid": "The Git operation is not valid",
  "errors.git_bare_repo": "This repository is a bare repository",
  "errors.git_unborn_branch": "This branch has no commits yet",
  "errors.io": "Reading or writing the file failed",
  "errors.serde": "The data format is invalid",
};