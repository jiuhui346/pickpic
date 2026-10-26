//! 分类命令：增删改查与归类。

use crate::db::categories as categories_db;
use crate::error::AppResult;
use crate::models::Category;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn categories_list(state: State<'_, AppState>) -> AppResult<Vec<Category>> {
    state.with_vault(|v| categories_db::list(&v.conn))
}

#[tauri::command]
pub async fn category_create(state: State<'_, AppState>, name: String) -> AppResult<Category> {
    state.with_vault(|v| categories_db::create(&v.conn, &name))
}

#[tauri::command]
pub async fn category_rename(state: State<'_, AppState>, id: i64, name: String) -> AppResult<()> {
    state.with_vault(|v| categories_db::rename(&v.conn, id, &name))
}

#[tauri::command]
pub async fn category_delete(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state.with_vault(|v| categories_db::delete(&v.conn, id))
}

#[tauri::command]
pub async fn category_assign(
    state: State<'_, AppState>,
    image_ids: Vec<i64>,
    category_id: i64,
) -> AppResult<()> {
    state.with_vault(|v| categories_db::assign(&v.conn, &image_ids, category_id))
}

#[tauri::command]
pub async fn category_unassign(
    state: State<'_, AppState>,
    image_ids: Vec<i64>,
    category_id: i64,
) -> AppResult<()> {
    state.with_vault(|v| categories_db::unassign(&v.conn, &image_ids, category_id))
}
