//! 设置命令：读取 / 局部更新（持久化到 settings 表）。

use crate::db::settings as settings_db;
use crate::error::{AppError, AppResult};
use crate::models::{Settings, SettingsPatch};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn settings_get(state: State<'_, AppState>) -> AppResult<Settings> {
    Ok(state.settings_snapshot())
}

#[tauri::command]
pub async fn settings_set(
    state: State<'_, AppState>,
    patch: SettingsPatch,
) -> AppResult<Settings> {
    let previous = state.settings_snapshot();
    let mut current = previous.clone();
    current.apply(&patch);
    if current.global_shortcut != previous.global_shortcut {
        crate::global_shortcut::apply_checked(
            &state.app,
            &current.global_shortcut,
            &previous.global_shortcut,
        )
        .map_err(|e| AppError::new("SHORTCUT", e))?;
    }
    state.with_vault(|v| settings_db::save(&v.conn, &current))?;
    if let Ok(mut guard) = state.settings.lock() {
        *guard = current.clone();
    }
    Ok(current)
}
