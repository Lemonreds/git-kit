use serde::ser::{Serialize, SerializeStruct, Serializer};

/// Errors surfaced to the frontend. Every variant carries a user-facing
/// Chinese message plus a stable machine-readable `code` so the UI can react
/// without matching on message text.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),

    #[error("路径不存在：{0}")]
    NotFound(String),

    #[error("该文件夹不是 Git 仓库：{0}")]
    NotARepo(String),

    #[error("没有访问权限：{0}")]
    Permission(String),

    #[error("该提交不存在：{0}")]
    CommitNotFound(String),

    #[error("该文件在此提交中没有改动：{0}")]
    FileNotChanged(String),

    #[error("{0}")]
    CommandFailed(String),

    #[error("{0}")]
    DirtyWorktree(String),

    #[error("{0}")]
    CherryPickConflict(String),

    #[error("{0}")]
    PullConflict(String),

    #[error("{0}")]
    RebaseConflict(String),

    #[error("{0}")]
    MergeConflict(String),

    #[error("{0}")]
    RevertConflict(String),

    #[error("{0}")]
    StashConflict(String),

    #[error("{0}")]
    RemoteInvalid(String),

    #[error("{0}")]
    ConfigInvalid(String),

    #[error("{0}")]
    PushRejected(String),

    #[error("{0}")]
    BranchInvalid(String),

    #[error("Git 错误：{0}")]
    Git(#[from] git2::Error),

    #[error("文件读写失败：{0}")]
    Io(#[from] std::io::Error),

    #[error("数据格式错误：{0}")]
    Serde(#[from] serde_json::Error),
}

impl AppError {
    pub fn message(msg: impl Into<String>) -> Self {
        AppError::Message(msg.into())
    }

    pub fn code(&self) -> &'static str {
        match self {
            AppError::Message(_) => "message",
            AppError::NotFound(_) => "not_found",
            AppError::NotARepo(_) => "not_a_repo",
            AppError::Permission(_) => "permission_denied",
            AppError::CommitNotFound(_) => "commit_not_found",
            AppError::FileNotChanged(_) => "file_not_changed",
            AppError::CommandFailed(_) => "command_failed",
            AppError::DirtyWorktree(_) => "dirty_worktree",
            AppError::CherryPickConflict(_) => "cherry_pick_conflict",
            AppError::PullConflict(_) => "pull_conflict",
            AppError::RebaseConflict(_) => "rebase_conflict",
            AppError::MergeConflict(_) => "merge_conflict",
            AppError::RevertConflict(_) => "revert_conflict",
            AppError::StashConflict(_) => "stash_conflict",
            AppError::RemoteInvalid(_) => "remote_invalid",
            AppError::ConfigInvalid(_) => "config_invalid",
            AppError::PushRejected(_) => "push_rejected",
            AppError::BranchInvalid(_) => "branch_invalid",
            AppError::Git(err) => git_error_code(err),
            AppError::Io(err) => io_error_code(err),
            AppError::Serde(_) => "serde",
        }
    }
}

fn git_error_code(err: &git2::Error) -> &'static str {
    use git2::ErrorCode;
    match err.code() {
        ErrorCode::NotFound => "git_not_found",
        ErrorCode::Auth => "git_auth",
        ErrorCode::Exists => "git_exists",
        ErrorCode::Invalid | ErrorCode::InvalidSpec => "git_invalid",
        ErrorCode::BareRepo => "git_bare_repo",
        ErrorCode::UnbornBranch => "git_unborn_branch",
        _ => "git_error",
    }
}

fn io_error_code(err: &std::io::Error) -> &'static str {
    use std::io::ErrorKind;
    match err.kind() {
        ErrorKind::NotFound => "not_found",
        ErrorKind::PermissionDenied => "permission_denied",
        _ => "io",
    }
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}
