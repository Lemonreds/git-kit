//! Built-in terminal: one pseudo terminal per opened project.
//!
//! The webview never gets a generic "run this command" capability. The only
//! thing it can ask for is an interactive shell inside a repository that is
//! already registered in the project list, and the byte stream flows back over a
//! Tauri [`Channel`] as raw `ArrayBuffer` chunks (no base64, no JSON number
//! arrays).
//!
//! Memory is the constraint that shaped this module:
//!
//! - a hard ceiling of [`MAX_SESSIONS`] live shells, enforced here as well as in
//!   the frontend (the frontend does the LRU eviction, this is the backstop);
//! - output is coalesced before it crosses the IPC boundary, so a `cargo build`
//!   costs a few dozen messages per second instead of thousands;
//! - when the panel is hidden the pump stops pushing bytes entirely and keeps
//!   only the tail of the stream ([`Gate`]), so a backgrounded `yes > /dev/null`
//!   cannot grow the app's RSS.

use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

use portable_pty::{
    native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize,
};
use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Manager, State};

use crate::commands::ProjectStoreState;
use crate::error::AppError;
use crate::project_store::ProjectStore;

/// Every live session keeps a shell process (plus whatever it runs) alive.
pub const MAX_SESSIONS: usize = 3;

/// Size of one `read()` from the pty master.
const READ_BUFFER: usize = 8 * 1024;
/// Push to the webview as soon as this much output piled up…
const FLUSH_THRESHOLD: usize = 32 * 1024;
/// While paused only the newest tail of the output is kept.
const PAUSED_LIMIT: usize = 64 * 1024;

pub type TerminalState = Mutex<TerminalManager>;

/// A session handle the frontend keeps in its store. Everything else (pty
/// master, writer, killer, channel) stays in Rust.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub id: String,
    pub project_id: String,
    pub cwd: String,
    pub shell: String,
}

/// What can arrive on the session channel. Raw bytes are the terminal output;
/// this enum is the out-of-band control frame.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum TerminalEvent {
    Exit { code: Option<u32> },
}

/// Pause gate for one session.
///
/// `paused` is flipped by `terminal_pause` / `terminal_resume` (the panel is
/// collapsed, or the window is hidden). While it is set the pump keeps draining
/// the pty — so the shell never blocks — but only remembers the tail.
#[derive(Debug, Default)]
struct Gate {
    paused: bool,
    tail: Vec<u8>,
}

impl Gate {
    /// Append while paused, keeping at most [`PAUSED_LIMIT`] bytes: the oldest
    /// output is dropped because a user who re-opens the panel cares about the
    /// end of the stream, not its beginning.
    fn hold(&mut self, data: &[u8]) {
        self.tail.extend_from_slice(data);
        if self.tail.len() > PAUSED_LIMIT {
            let excess = self.tail.len() - PAUSED_LIMIT;
            self.tail.drain(..excess);
        }
    }
}

struct Session {
    shell: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    gate: Arc<Mutex<Gate>>,
    channel: Channel<InvokeResponseBody>,
}

#[derive(Default)]
pub struct TerminalManager {
    /// Guarded by the outer `Mutex` in [`TerminalState`]; the map itself owns the
    /// pty handles, so a second lock would only add deadlock surface.
    sessions: HashMap<String, Session>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self::default()
    }
}

fn lock_sessions<'a>(
    manager: &'a State<'_, TerminalState>,
) -> Result<MutexGuard<'a, TerminalManager>, AppError> {
    manager
        .lock()
        .map_err(|_| AppError::Terminal("终端状态异常，请重启应用".to_string()))
}

fn lock_store<'a>(
    state: &'a State<'_, ProjectStoreState>,
) -> Result<MutexGuard<'a, ProjectStore>, AppError> {
    state
        .lock()
        .map_err(|_| AppError::Terminal("项目列表状态异常，请重启应用".to_string()))
}

/// The login shell to start inside the pty.
///
/// Started as a *login* shell on purpose: an app launched from Finder inherits a
/// PATH of only `/usr/bin:/bin:/usr/sbin:/sbin`. Without `-l` neither Homebrew
/// nor nvm nor a git installed outside `/usr/bin` is on PATH, and the very first
/// command the user types fails with `command not found`.
fn default_shell() -> String {
    #[cfg(windows)]
    {
        // Prefer PowerShell 7 when it is installed, fall back to Windows PowerShell.
        if Path::new(r"C:\Program Files\PowerShell\7\pwsh.exe").exists() {
            "pwsh.exe".to_string()
        } else {
            "powershell.exe".to_string()
        }
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "/bin/zsh".to_string())
    }
}

fn shell_args(shell: &str) -> Vec<String> {
    #[cfg(windows)]
    {
        let _ = shell;
        vec!["-NoLogo".to_string()]
    }
    #[cfg(not(windows))]
    {
        let name = shell.rsplit('/').next().unwrap_or(shell);
        if matches!(name, "zsh" | "bash" | "sh" | "dash" | "ksh" | "fish") {
            vec!["-l".to_string()]
        } else {
            Vec::new()
        }
    }
}

/// Resolve the program plus its arguments. Kept free of side effects so the
/// shell selection can be unit tested.
fn shell_command(override_path: Option<&str>) -> (String, Vec<String>) {
    let shell = override_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(default_shell);
    let args = shell_args(&shell);
    (shell, args)
}

/// Only registered projects may own a terminal, and the directory must still
/// exist. This is the whole security boundary of the feature: no arbitrary
/// program, no arguments, no working directory picked by the webview.
fn authorize(store: &ProjectStore, path: &str) -> Result<(String, String), AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::Terminal(
            "请先选择一个项目，再打开终端".to_string(),
        ));
    }
    let Some(record) = store.find_by_path(trimmed) else {
        return Err(AppError::Terminal(
            "只能在已添加的项目目录里打开终端".to_string(),
        ));
    };
    if !Path::new(&record.path).is_dir() {
        return Err(AppError::NotFound(record.path.clone()));
    }
    Ok((record.id.clone(), record.path.clone()))
}

fn ensure_capacity(live: usize) -> Result<(), AppError> {
    if live >= MAX_SESSIONS {
        return Err(AppError::Terminal(format!(
            "最多同时打开 {MAX_SESSIONS} 个终端，请先关闭一个"
        )));
    }
    Ok(())
}

fn clamp_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.clamp(20, 400),
        rows: rows.clamp(4, 200),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn send_raw(channel: &Channel<InvokeResponseBody>, bytes: Vec<u8>) {
    // A failing send means the webview is gone; the pipe closes on its own.
    let _ = channel.send(InvokeResponseBody::Raw(bytes));
}

fn exit_event(code: Option<u32>) -> String {
    serde_json::to_string(&TerminalEvent::Exit { code })
        .unwrap_or_else(|_| r#"{"kind":"exit","code":null}"#.to_string())
}

fn notify_exit(channel: &Channel<InvokeResponseBody>, code: Option<u32>) {
    let _ = channel.send(InvokeResponseBody::Json(exit_event(code)));
}

/// Drain one pty until it closes.
///
/// The thread owns the child so it can report the exit status; the manager keeps
/// an independent [`ChildKiller`] for `terminal_close`. On EOF the session is
/// dropped from the manager as well, otherwise a shell the user closed with
/// `exit` would keep occupying one of the [`MAX_SESSIONS`] slots.
fn pump(
    app: AppHandle,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn Child + Send + Sync>,
    channel: Channel<InvokeResponseBody>,
    gate: Arc<Mutex<Gate>>,
) {
    let _ = std::thread::Builder::new()
        .name("gk-terminal".to_string())
        .spawn(move || {
            let mut chunk = [0u8; READ_BUFFER];
            let mut batch: Vec<u8> = Vec::with_capacity(FLUSH_THRESHOLD);

            loop {
                let read = match reader.read(&mut chunk) {
                    Ok(0) => break, // EOF: the shell exited
                    Ok(read) => read,
                    Err(error) if error.kind() == ErrorKind::Interrupted => continue,
                    Err(_) => break,
                };

                // The panel is collapsed or the window is hidden: keep only the
                // tail and never wake the webview up.
                let mut held = gate.lock().unwrap_or_else(|poison| poison.into_inner());
                if held.paused {
                    // `batch` predates the pause, so it belongs in front of this
                    // read — otherwise it would only reach the screen after the
                    // *next* output, whenever that is.
                    if !batch.is_empty() {
                        held.hold(&batch);
                        batch.clear();
                    }
                    held.hold(&chunk[..read]);
                    continue;
                }
                drop(held);

                batch.extend_from_slice(&chunk[..read]);
                // Coalesce a sustained burst into 32 KB messages, but flush a
                // short read straight away: a short read means the pty buffer is
                // empty, i.e. this burst is over. Without that rule the tail of a
                // burst would sit in `batch` until the *next* output arrived,
                // which is exactly the prompt the user is waiting for.
                if batch.len() >= FLUSH_THRESHOLD || read < chunk.len() {
                    send_raw(&channel, std::mem::take(&mut batch));
                    batch.reserve(FLUSH_THRESHOLD);
                }
            }

            if !batch.is_empty() {
                send_raw(&channel, batch);
            }
            let code = child.wait().ok().map(|status| status.exit_code());
            notify_exit(&channel, code);

            // The shell is gone: release its slot so the next open is not
            // refused by the capacity check.
            if let Some(manager) = app.try_state::<TerminalState>() {
                if let Ok(mut manager) = manager.lock() {
                    manager.sessions.remove(&session_id);
                }
            }
        });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Open an interactive shell in a registered repository.
#[tauri::command]
pub fn terminal_open(
    app: AppHandle,
    store: State<'_, ProjectStoreState>,
    manager: State<'_, TerminalState>,
    path: String,
    cols: u16,
    rows: u16,
    shell: Option<String>,
    on_event: Channel<InvokeResponseBody>,
) -> Result<TerminalSessionInfo, AppError> {
    let (project_id, cwd) = {
        let store = lock_store(&store)?;
        authorize(&store, &path)?
    };

    let mut terminal = lock_sessions(&manager)?;
    ensure_capacity(terminal.sessions.len())?;

    let (program, args) = shell_command(shell.as_deref());
    let id = uuid::Uuid::new_v4().to_string();
    let session = spawn(
        app,
        id.clone(),
        cwd.clone(),
        program,
        args,
        cols,
        rows,
        on_event,
    )?;
    let info = TerminalSessionInfo {
        id,
        project_id,
        cwd,
        shell: session.shell.clone(),
    };
    terminal.sessions.insert(info.id.clone(), session);
    Ok(info)
}

#[allow(clippy::too_many_arguments)]
fn spawn(
    app: AppHandle,
    session_id: String,
    cwd: String,
    program: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
    channel: Channel<InvokeResponseBody>,
) -> Result<Session, AppError> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(clamp_size(cols, rows))
        .map_err(|error| AppError::Terminal(format!("无法创建伪终端：{error}")))?;

    let mut command = CommandBuilder::new(&program);
    command.args(&args);
    command.cwd(&cwd);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("TERM_PROGRAM", "GitKit");
    // LANG / LC_ALL are inherited on purpose: forcing en_US.UTF-8 (as the git
    // CLI wrapper does) would mangle Chinese file names in the prompt.
    command.env_remove("ELECTRON_RUN_AS_NODE");

    let child = pair.slave.spawn_command(command).map_err(|error| {
        AppError::Terminal(format!("无法启动 {program}：{error}"))
    })?;
    let killer = child.clone_killer();
    // The child holds its own slave fd; ours would only keep the pty open.
    drop(pair.slave);

    let master = pair.master;
    let reader = master
        .try_clone_reader()
        .map_err(|error| AppError::Terminal(format!("无法读取终端输出：{error}")))?;
    let writer = master
        .take_writer()
        .map_err(|error| AppError::Terminal(format!("无法写入终端：{error}")))?;

    let gate = Arc::new(Mutex::new(Gate::default()));
    pump(app, session_id, reader, child, channel.clone(), Arc::clone(&gate));

    Ok(Session {
        shell: program,
        master,
        writer,
        killer,
        gate,
        channel,
    })
}

/// Keystrokes from xterm.js. Low latency matters here, so nothing is batched.
#[tauri::command]
pub fn terminal_write(
    manager: State<'_, TerminalState>,
    id: String,
    data: String,
) -> Result<(), AppError> {
    let mut terminal = lock_sessions(&manager)?;
    let session = terminal
        .sessions
        .get_mut(&id)
        .ok_or_else(|| AppError::Terminal("终端会话已结束".to_string()))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| AppError::Terminal(format!("写入终端失败：{error}")))
}

#[tauri::command]
pub fn terminal_resize(
    manager: State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    let terminal = lock_sessions(&manager)?;
    let session = terminal
        .sessions
        .get(&id)
        .ok_or_else(|| AppError::Terminal("终端会话已结束".to_string()))?;
    session
        .master
        .resize(clamp_size(cols, rows))
        .map_err(|error| AppError::Terminal(format!("调整终端大小失败：{error}")))
}

/// Stop pushing output to the webview; the pump keeps only the tail.
#[tauri::command]
pub fn terminal_pause(manager: State<'_, TerminalState>, id: String) -> Result<(), AppError> {
    let terminal = lock_sessions(&manager)?;
    let Some(session) = terminal.sessions.get(&id) else {
        return Ok(());
    };
    session
        .gate
        .lock()
        .map_err(|_| AppError::Terminal("终端状态异常".to_string()))?
        .paused = true;
    Ok(())
}

/// Flush the buffered tail and resume live output.
#[tauri::command]
pub fn terminal_resume(manager: State<'_, TerminalState>, id: String) -> Result<(), AppError> {
    let terminal = lock_sessions(&manager)?;
    let Some(session) = terminal.sessions.get(&id) else {
        return Ok(());
    };
    let mut gate = session
        .gate
        .lock()
        .map_err(|_| AppError::Terminal("终端状态异常".to_string()))?;
    gate.paused = false;
    if !gate.tail.is_empty() {
        // Sent while the gate is held so the tail cannot be reordered behind
        // live output the pump sends right after the flag flips.
        let tail = std::mem::take(&mut gate.tail);
        send_raw(&session.channel, tail);
    }
    Ok(())
}

/// Kill the shell and release the pty. Dropping `master` also hangs up the
/// shell's foreground process group, so `vim` does not survive the tab.
#[tauri::command]
pub fn terminal_close(manager: State<'_, TerminalState>, id: String) -> Result<(), AppError> {
    let mut terminal = lock_sessions(&manager)?;
    if let Some(mut session) = terminal.sessions.remove(&id) {
        let _ = session.killer.kill();
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn store_with(projects: &[(&str, &str)]) -> (tempfile::TempDir, ProjectStore) {
        let dir = tempfile::tempdir().unwrap();
        let mut store = ProjectStore::load(dir.path()).unwrap();
        for (index, (path, name)) in projects.iter().enumerate() {
            store
                .upsert(crate::project_store::ProjectRecord {
                    id: format!("p{index}"),
                    path: (*path).to_string(),
                    name: (*name).to_string(),
                    added_at: 0,
                    last_opened_at: 0,
                    pinned: false,
                    pinned_at: None,
                })
                .unwrap();
        }
        (dir, store)
    }

    #[test]
    fn login_shell_is_used_so_path_survives() {
        #[cfg(not(windows))]
        {
            assert_eq!(shell_args("/bin/zsh"), vec!["-l".to_string()]);
            assert_eq!(shell_args("/usr/local/bin/fish"), vec!["-l".to_string()]);
            // An exotic shell keeps its own defaults instead of getting a flag
            // it may not understand.
            assert!(shell_args("/opt/bin/xonsh").is_empty());
        }
        #[cfg(windows)]
        {
            assert_eq!(shell_args("powershell.exe"), vec!["-NoLogo".to_string()]);
        }
    }

    #[test]
    fn explicit_shell_override_wins() {
        let (program, args) = shell_command(Some("/bin/bash"));
        assert_eq!(program, "/bin/bash");
        assert_eq!(args, shell_args("/bin/bash"));
    }

    #[test]
    fn blank_override_falls_back_to_the_default_shell() {
        let (program, _) = shell_command(Some("   "));
        assert_eq!(program, default_shell());
    }

    #[test]
    fn terminal_requires_a_registered_project() {
        let repo = tempfile::tempdir().unwrap();
        let (_guard, store) = store_with(&[(repo.path().to_str().unwrap(), "demo")]);

        let (project_id, cwd) = authorize(&store, repo.path().to_str().unwrap()).unwrap();
        assert_eq!(project_id, "p0");
        assert_eq!(cwd, repo.path().to_str().unwrap());

        // A directory the user never added to the list must be rejected.
        let other = tempfile::tempdir().unwrap();
        let error = authorize(&store, other.path().to_str().unwrap()).unwrap_err();
        assert_eq!(error.code(), "terminal");

        // An empty path is rejected before touching the filesystem.
        assert_eq!(authorize(&store, "  ").unwrap_err().code(), "terminal");
    }

    #[test]
    fn terminal_rejects_a_project_that_disappeared() {
        let repo = tempfile::tempdir().unwrap();
        let path = repo.path().to_str().unwrap().to_string();
        let (_guard, store) = store_with(&[(path.as_str(), "gone")]);
        drop(repo);

        assert_eq!(authorize(&store, &path).unwrap_err().code(), "not_found");
    }

    #[test]
    fn capacity_is_capped() {
        for live in 0..MAX_SESSIONS {
            assert!(ensure_capacity(live).is_ok());
        }
        let error = ensure_capacity(MAX_SESSIONS).unwrap_err();
        assert_eq!(error.code(), "terminal");
    }

    #[test]
    fn paused_gate_keeps_only_the_tail() {
        let mut gate = Gate::default();
        gate.paused = true;
        gate.hold(&vec![b'a'; PAUSED_LIMIT]);
        gate.hold(b"tail");
        assert_eq!(gate.tail.len(), PAUSED_LIMIT);
        assert_eq!(&gate.tail[PAUSED_LIMIT - 4..], b"tail");
    }

    #[test]
    fn sizes_are_clamped_before_reaching_the_kernel() {
        let tiny = clamp_size(0, 0);
        assert_eq!((tiny.cols, tiny.rows), (20, 4));
        let huge = clamp_size(u16::MAX, u16::MAX);
        assert_eq!((huge.cols, huge.rows), (400, 200));
    }

    #[test]
    fn exit_event_is_a_camel_case_control_frame() {
        assert_eq!(exit_event(Some(0)), r#"{"kind":"exit","code":0}"#);
        assert_eq!(exit_event(None), r#"{"kind":"exit","code":null}"#);
    }

    /// The only test that touches a real pseudo terminal: it proves the crate the
    /// whole feature stands on actually spawns a shell in the requested working
    /// directory and hands its bytes back.
    #[cfg(unix)]
    #[test]
    fn pty_round_trip_reaches_the_screen() {
        use std::time::{Duration, Instant};

        let repo = tempfile::tempdir().unwrap();
        let pair = native_pty_system().openpty(clamp_size(80, 24)).unwrap();

        let mut command = CommandBuilder::new("/bin/sh");
        command.args(["-c", "printf 'gk-ok\\n'"]);
        command.cwd(repo.path());

        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();

        let mut output = Vec::new();
        let mut buffer = [0u8; 1024];
        // Bounded so a silent pty fails the test instead of hanging the suite.
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    output.extend_from_slice(&buffer[..read]);
                    if output.windows(5).any(|window| window == b"gk-ok") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        let text = String::from_utf8_lossy(&output);
        assert!(text.contains("gk-ok"), "pty produced {text:?}");
        assert!(child.wait().unwrap().success());
    }
}