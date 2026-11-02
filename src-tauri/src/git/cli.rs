use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::error::AppError;

/// Network / credential touching operations get a hard ceiling so a webview
/// command never hangs forever on a credential helper.
pub const NETWORK_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Default)]
pub struct GitOutput {
    pub stdout: String,
    pub stderr: String,
}

impl GitOutput {
    /// Best human-readable summary: git writes progress to stderr and the
    /// useful result line to stdout.
    pub fn display(&self) -> String {
        let stdout = self.stdout.trim();
        let stderr = self.stderr.trim();
        match (stdout.is_empty(), stderr.is_empty()) {
            (false, false) => format!("{stdout}\n{stderr}"),
            (false, true) => stdout.to_string(),
            (true, false) => stderr.to_string(),
            (true, true) => String::new(),
        }
    }
}

fn reject_option_like(value: &str, what: &str) -> Result<(), AppError> {
    if value.starts_with('-') {
        return Err(AppError::message(format!("非法的{what}：{value}")));
    }
    Ok(())
}

/// Run `git -C <repo> <args>` with a clean environment.
///
/// Writes and network operations deliberately go through the system git binary:
/// it reuses the user's existing SSH keys, credential helper and proxy config,
/// so Git Kit never has to store credentials itself.
pub fn run(repo: &Path, args: &[&str], timeout: Option<Duration>) -> Result<GitOutput, AppError> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("LC_ALL", "en_US.UTF-8")
        // Fail fast instead of blocking on a hidden terminal prompt.
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // On Windows, prevent console window from appearing
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|error| {
        AppError::message(format!(
            "无法启动 git 命令（请确认已安装 Git 命令行工具）：{error}"
        ))
    })?;

    let mut stdout_pipe = child.stdout.take();
    let mut stderr_pipe = child.stderr.take();
    let stdout_reader = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        if let Some(pipe) = stdout_pipe.as_mut() {
            let _ = pipe.read_to_end(&mut buffer);
        }
        buffer
    });
    let stderr_reader = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        if let Some(pipe) = stderr_pipe.as_mut() {
            let _ = pipe.read_to_end(&mut buffer);
        }
        buffer
    });

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(error) => return Err(AppError::Io(error)),
        }

        if let Some(limit) = timeout {
            if started.elapsed() > limit {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(AppError::CommandFailed(
                    "操作超时（120 秒），请检查网络、代理或凭据配置后重试".to_string(),
                ));
            }
        }
        std::thread::sleep(Duration::from_millis(40));
    };

    let stdout = String::from_utf8_lossy(&stdout_reader.join().unwrap_or_default()).to_string();
    let stderr = String::from_utf8_lossy(&stderr_reader.join().unwrap_or_default()).to_string();
    let output = GitOutput { stdout, stderr };

    if !status.success() {
        let detail = output.display();
        let detail = if detail.is_empty() {
            format!("git 命令执行失败（退出码 {}）", status.code().unwrap_or(-1))
        } else {
            detail
        };
        return Err(AppError::CommandFailed(detail));
    }

    Ok(output)
}

pub fn run_blocking(repo: &Path, args: &[&str]) -> Result<GitOutput, AppError> {
    run(repo, args, None)
}

/// Branch names are passed to git as arguments, so refuse anything that could
/// be parsed as an option.
pub fn ensure_branch_checked_out(repo: &Path, branch: &str) -> Result<(), AppError> {
    reject_option_like(branch, "分支名")?;
    // `--` makes git treat the argument as a ref even if a file shares the name.
    run_blocking(repo, &["checkout", branch, "--"])
        .map(|_| ())
        .map_err(|error| match error {
            AppError::CommandFailed(detail) => AppError::CommandFailed(format!(
                "切换到分支 {branch} 失败：{detail}\n请先提交或暂存本地改动后重试"
            )),
            other => other,
        })
}

/// Refuse history-rewriting operations while the worktree is dirty, so user
/// changes never end up swept into a squash or an interrupted cherry-pick.
pub fn ensure_clean_worktree(repo: &Path) -> Result<(), AppError> {
    let output = run_blocking(repo, &["status", "--porcelain"])?;
    if output.stdout.trim().is_empty() {
        return Ok(());
    }
    Err(AppError::DirtyWorktree(
        "工作区还有未提交的改动，请先暂存或提交后再执行该操作".to_string(),
    ))
}
