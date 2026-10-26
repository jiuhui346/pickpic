//! 标签命令：列表、创建、打标签 / 取消标签。

use crate::db::tags as tags_db;
use crate::error::AppResult;
use crate::models::Tag;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn tags_list(state: State<'_, AppState>) -> AppResult<Vec<Tag>> {
    state.with_vault(|v| tags_db::list(&v.conn))
}

#[tauri::command]
pub async fn tag_create(state: State<'_, AppState>, name: String) -> AppResult<Tag> {
    state.with_vault(|v| tags_db::create(&v.conn, &name))
}

#[tauri::command]
pub async fn tag_assign(
    state: State<'_, AppState>,
    image_ids: Vec<i64>,
    tag_id: i64,
) -> AppResult<()> {
    state.with_vault(|v| tags_db::assign(&v.conn, &image_ids, tag_id))
}

#[tauri::command]
pub async fn tag_unassign(
    state: State<'_, AppState>,
    image_ids: Vec<i64>,
    tag_id: i64,
) -> AppResult<()> {
    state.with_vault(|v| tags_db::unassign(&v.conn, &image_ids, tag_id))
}
