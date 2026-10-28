//! PickPic —— 本地图库（Tauri 2 + React 18）。

mod commands;
mod core;
mod db;
mod error;
mod mcp;
mod models;
mod plugins;
mod state;

use state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

static QUITTING: AtomicBool = AtomicBool::new(false);

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn checkpoint_vault(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(guard) = state.vault.lock() {
            if let Some(vault) = guard.as_ref() {
                db::checkpoint(&vault.conn);
            }
        }
    }
}

/// Migrate legacy Image Vault AppData directory to PickPic.
fn migrate_legacy_data() {
    let Ok(base) = std::env::var("APPDATA") else { return };
    let old = std::path::PathBuf::from(&base).join("ImageVault");
    let new = std::path::PathBuf::from(&base).join("PickPic");
    if !new.exists() && old.exists() {
        if std::fs::rename(&old, &new).is_err() {
            let _ = copy_dir(&old, &new);
        }
    }
}

fn copy_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

pub fn run_mcp_stdio() -> i32 {
    migrate_legacy_data();
    mcp::stdio::run()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    migrate_legacy_data();
    tauri::Builder::default()
        // 单实例必须最先注册：避免两个进程同时写同一个 SQLite。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        show_main(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let state = AppState::new(app.handle().clone());
            app.manage(state);

            // 全局快捷键：Ctrl+Alt+P 呼出主界面
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP);
            if let Err(err) = app.global_shortcut().register(shortcut) {
                eprintln!("global shortcut register failed: {err}");
            }

            // 托盘：关闭窗口时隐藏，托盘图标/菜单恢复
            let show_item = MenuItemBuilder::with_id("show", "显示拾图").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出拾图").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show_item, &quit_item]).build()?;
            let mut tray_builder = TrayIconBuilder::with_id("main-tray")
                .tooltip("拾图 · Ctrl+Alt+P 呼出")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main(app),
                    "quit" => {
                        checkpoint_vault(app);
                        QUITTING.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            let tray = tray_builder.build(app)?;
            // TrayIcon 在 Drop 时会移除图标，必须保持存活
            std::mem::forget(tray);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                checkpoint_vault(window.app_handle());
                if !QUITTING.load(Ordering::SeqCst) && window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault::vault_boot,
            commands::vault::vault_choose,
            commands::vault::vault_info,
            commands::vault::vault_migrate,
            commands::vault::suggested_vault_path,
            commands::vault::app_exe_path,
            commands::images::images_list,
            commands::images::probe_paths,
            commands::images::scan_folder,
            commands::images::import_one,
            commands::images::thumb_ensure,
            commands::images::image_paths,
            commands::images::export_move,
            commands::images::discard_files,
            commands::images::drag_begin,
            commands::images::drag_end_check,
            commands::images::drag_icon,
            commands::images::delete_images,
            commands::images::rename_image,
            commands::images::export_images,
            commands::images::find_duplicate,
            commands::images::backfill_hashes,
            commands::images::maintenance_scan,
            commands::images::import_existing,
            commands::images::rebuild_index,
            commands::categories::categories_list,
            commands::categories::category_create,
            commands::categories::category_rename,
            commands::categories::category_delete,
            commands::categories::category_assign,
            commands::categories::category_unassign,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::tags::tags_list,
            commands::tags::tag_create,
            commands::tags::tag_assign,
            commands::tags::tag_unassign,
            commands::mcp::mcp_status,
            commands::mcp::mcp_restart,
            commands::plugins::plugins_list,
            commands::plugins::plugin_code,
            commands::plugins::plugin_set_enabled,
            commands::plugins::plugin_install,
            commands::plugins::plugin_repo_list,
            commands::plugins::plugin_repo_install,
            commands::plugins::plugins_open_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
