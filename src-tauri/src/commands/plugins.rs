//! 插件管理命令。

use crate::error::{AppError, AppResult};
use crate::plugins::{self, PluginInfo, RemotePlugin};

#[tauri::command]
pub async fn plugins_list() -> AppResult<Vec<PluginInfo>> {
    plugins::list().map_err(|e| AppError::new("PLUGIN", e))
}

#[tauri::command]
pub async fn plugin_code(id: String) -> AppResult<String> {
    plugins::code(&id).map_err(|e| AppError::new("PLUGIN", e))
}

#[tauri::command]
pub async fn plugin_set_enabled(id: String, enabled: bool) -> AppResult<()> {
    plugins::set_enabled(&id, enabled).map_err(|e| AppError::new("PLUGIN", e))
}

#[tauri::command]
pub async fn plugin_install(source: String) -> AppResult<()> {
    plugins::install(&source).map_err(|e| AppError::new("PLUGIN", e))
}

#[tauri::command]
pub async fn plugins_open_dir() -> AppResult<()> {
    plugins::open_dir().map_err(|e| AppError::new("PLUGIN", e))
}

#[tauri::command]
pub async fn plugin_repo_list(url: String) -> AppResult<Vec<RemotePlugin>> {
    plugins::fetch_repo(&url).map_err(|e| AppError::new("PLUGIN_REPO", e))
}

#[tauri::command]
pub async fn plugin_repo_install(url: String, id: String) -> AppResult<()> {
    plugins::install_from_repo(&url, &id).map_err(|e| AppError::new("PLUGIN_REPO", e))
}
