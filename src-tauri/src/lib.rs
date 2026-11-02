mod commands;
mod error;
mod git;
mod model;
mod project_store;
mod settings;
mod terminal;

use std::sync::Mutex;

use tauri::{Manager, WebviewWindow};

use project_store::ProjectStore;
use settings::SettingsStore;
use terminal::TerminalManager;

/// Keep the window reachable after display changes (undocked laptop, external
/// monitor unplugged): if it no longer intersects any monitor, re-center it.
fn ensure_window_visible(window: &WebviewWindow) {
    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };

    let monitors = window.available_monitors().unwrap_or_default();
    let visible = monitors.iter().any(|monitor| {
        let area = monitor.position();
        let area_size = monitor.size();
        position.x + size.width as i32 > area.x
            && position.x < area.x + area_size.width as i32
            && position.y + size.height as i32 > area.y
            && position.y < area.y + area_size.height as i32
    });

    if !visible {
        let _ = window.center();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            let store = ProjectStore::load(&app_dir)?;
            app.manage(Mutex::new(store));

            let settings = SettingsStore::load(&app_dir)?;
            app.manage(Mutex::new(settings));

            app.manage(Mutex::new(TerminalManager::new()));

            if let Some(window) = app.get_webview_window("main") {
                ensure_window_visible(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::add_project,
            commands::relink_project,
            commands::remove_project,
            commands::set_active_project,
            commands::set_project_pinned,
            commands::get_repo_snapshot,
            commands::list_remotes,
            commands::add_remote,
            commands::remove_remote,
            commands::get_repo_identity,
            commands::set_repo_identity,
            commands::list_branches,
            commands::list_remote_branches,
            commands::list_commits,
            commands::get_commit,
            commands::get_commit_files,
            commands::get_file_diff,
            commands::get_file_content,
            commands::get_worktree_status,
            commands::stage_file,
            commands::unstage_file,
            commands::discard_file,
            commands::stage_all,
            commands::unstage_all,
            commands::discard_all,
            commands::get_worktree_diff,
            commands::commit_staged,
            commands::squash_preview,
            commands::squash_commits,
            commands::cherry_pick,
            commands::create_branch,
            commands::checkout_branch,
            commands::delete_local_branches,
            commands::push_preview,
            commands::pull_preview,
            commands::pull_branch,
            commands::rebase_preview,
            commands::rebase_branch,
            commands::push_branch,
            commands::sync_branch,
            commands::fetch_all,
            commands::get_repo_state,
            commands::repo_operation_action,
            commands::stash_list,
            commands::stash_push,
            commands::stash_pop,
            commands::stash_drop,
            commands::head_commit_preview,
            commands::amend_commit,
            commands::ignore_path,
            commands::merge_preview,
            commands::merge_branch,
            commands::revert_commit,
            commands::list_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::push_tag,
            commands::reflog_entries,
            commands::reset_to,
            commands::compare_refs,
            commands::compare_file_diff,
            commands::get_settings,
            commands::save_branch_templates,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_pause,
            terminal::terminal_resume,
            terminal::terminal_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
