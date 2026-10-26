//! MCP 服务状态与重启命令。

use crate::error::AppResult;
use crate::mcp::{self, McpStatus};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn mcp_status(state: State<'_, AppState>) -> AppResult<McpStatus> {
    let settings = state.settings_snapshot();
    let mut status = mcp::status(&state.app, &settings.mcp_token, None);
    if settings.mcp_enabled && !status.running {
        status.error = Some("MCP 未运行：端口可能被占用，请更换端口后点「保存」".to_string());
    }
    Ok(status)
}

#[tauri::command]
pub async fn mcp_restart(state: State<'_, AppState>) -> AppResult<McpStatus> {
    let mut settings = state.settings_snapshot();
    if settings.mcp_enabled && settings.mcp_token.is_empty() {
        settings.mcp_token = uuid::Uuid::new_v4().simple().to_string();
        let _ = state.with_vault(|v| crate::db::settings::save(&v.conn, &settings));
        if let Ok(mut guard) = state.settings.lock() {
            *guard = settings.clone();
        }
    }
    Ok(mcp::apply(&state.app, &settings))
}
