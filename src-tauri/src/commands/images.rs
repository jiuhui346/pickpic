//! 图片相关命令：列表、探测、导入、缩略图、拖出准备、移出库。

use crate::core::import as import_core;
use crate::core::manage as manage_core;
use crate::core::scan as scan_core;
use crate::core::thumb as thumb_core;
use crate::core::{fsutil, meta};
use crate::db::images as images_db;
use crate::error::{AppError, AppResult};
use crate::models::{ImageMeta, ImportOutcome, ProbeResult, ThumbResult};
use crate::state::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn images_list(state: State<'_, AppState>) -> AppResult<Vec<ImageMeta>> {
    state.with_vault(|v| images_db::list(&v.conn))
}

#[tauri::command]
pub async fn probe_paths(paths: Vec<String>) -> AppResult<ProbeResult> {
    Ok(import_core::probe(&paths))
}

#[tauri::command]
pub async fn scan_folder(path: String) -> AppResult<Vec<String>> {
    Ok(import_core::scan_folder(&PathBuf::from(path)))
}

#[tauri::command]
pub async fn import_one(
    state: State<'_, AppState>,
    source: String,
    name: String,
    mode: String,
) -> AppResult<ImportOutcome> {
    import_core::import_one(&state, &source, &name, &mode)
}

/// 取缩略图；不存在则在后台生成（最多 4 并发）。
#[tauri::command]
pub async fn thumb_ensure(state: State<'_, AppState>, id: i64) -> AppResult<ThumbResult> {
    let root = state.root()?;
    let info = state.with_vault(|v| images_db::thumb_info(&v.conn, id))?;
    let Some((rel_path, thumb_rel, thumb_state, width, height)) = info else {
        return Err(AppError::new("NOT_FOUND", "图片不存在"));
    };

    if thumb_state == 1 {
        if let Some(rel) = &thumb_rel {
            let p = fsutil::abs_path(&root, rel);
            if p.is_file() {
                return Ok(ThumbResult {
                    state: "ready".to_string(),
                    path: Some(p.to_string_lossy().to_string()),
                    width,
                    height,
                });
            }
        }
    }
    if thumb_state == 2 {
        return Ok(ThumbResult {
            state: "broken".to_string(),
            path: None,
            width: None,
            height: None,
        });
    }

    let permit = state
        .thumb_sem
        .acquire()
        .await
        .map_err(|_| AppError::internal("缩略图队列异常"))?;

    let source = fsutil::abs_path(&root, &rel_path);
    let ext = meta::ext_of(&source).unwrap_or_default();
    let thumbs_dir = root.join("thumbs");
    std::fs::create_dir_all(fsutil::fs_path(&thumbs_dir))
        .map_err(|e| AppError::io("创建缩略图目录失败", e))?;
    let dest_stem = thumbs_dir.join(id.to_string());

    let generated = tauri::async_runtime::spawn_blocking(move || {
        thumb_core::generate(&source, &ext, &dest_stem)
    })
    .await
    .map_err(|e| AppError::internal(format!("缩略图任务失败：{e}")))?;
    drop(permit);

    match generated {
        Ok(out) => {
            state.with_vault(|v| {
                images_db::update_thumb(
                    &v.conn,
                    id,
                    Some(&out.rel_path),
                    1,
                    Some(out.width),
                    Some(out.height),
                )
            })?;
            let p = fsutil::abs_path(&root, &out.rel_path);
            Ok(ThumbResult {
                state: "ready".to_string(),
                path: Some(p.to_string_lossy().to_string()),
                width: Some(out.width),
                height: Some(out.height),
            })
        }
        Err(err) => {
            state.with_vault(|v| images_db::update_thumb(&v.conn, id, None, 2, None, None))?;
            let detail = err.detail.clone().unwrap_or_default();
            eprintln!("缩略图生成失败 id={id}: {detail}");
            Ok(ThumbResult {
                state: "broken".to_string(),
                path: None,
                width: None,
                height: None,
            })
        }
    }
}

/// 检测重复图片：返回库里内容完全相同的第一个文件。
#[tauri::command]
pub async fn find_duplicate(
    state: State<'_, AppState>,
    source: String,
) -> AppResult<Option<crate::models::DuplicateInfo>> {
    let path = std::path::PathBuf::from(&source);
    if !path.is_file() {
        return Ok(None);
    }
    let hash = crate::core::hash::file_hash(&path)?;
    state.with_vault(|v| {
        let found = images_db::find_by_hash(&v.conn, &hash)?;
        Ok(found.map(|(id, file_name, size_bytes)| crate::models::DuplicateInfo {
            id,
            file_name,
            size_bytes,
        }))
    })
}

/// 拖出 / 移动出库需要的绝对路径。
#[tauri::command]
pub async fn image_paths(state: State<'_, AppState>, ids: Vec<i64>) -> AppResult<Vec<String>> {
    state.with_vault(|v| {
        let rows = images_db::paths_by_ids(&v.conn, &ids)?;
        Ok(rows
            .into_iter()
            .map(|(_, rel)| fsutil::abs_path(&v.root, &rel).to_string_lossy().to_string())
            .collect())
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMoveResult {
    pub removed: usize,
    pub failed: Vec<String>,
}

/// 拖出「移动」模式：导出成功后从库中删除文件与记录。
#[tauri::command]
pub async fn export_move(
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> AppResult<ExportMoveResult> {
    let mut removed = 0usize;
    let mut failed = Vec::new();
    state.with_vault(|v| {
        let rows = images_db::paths_by_ids(&v.conn, &ids)?;
        for (id, rel) in rows {
            let abs = fsutil::abs_path(&v.root, &rel);
            if abs.exists() {
                if let Err(err) = std::fs::remove_file(fsutil::fs_path(&abs)) {
                    failed.push(format!("{}：{}", rel, crate::error::human_io(&err)));
                    continue;
                }
            }
            // 删除缩略图缓存
            for ext in ["jpg", "png"] {
                let thumb = v.root.join("thumbs").join(format!("{id}.{ext}"));
                fsutil::remove_file_quietly(&thumb);
            }
            images_db::delete(&v.conn, id)?;
            removed += 1;
        }
        Ok(ExportMoveResult { removed, failed })
    })
}

/// 处理"拖回图库目录"的副本：删除指定相对路径文件。
#[tauri::command]
pub async fn discard_files(state: State<'_, AppState>, rels: Vec<String>) -> AppResult<usize> {
    state.with_vault(|v| {
        let mut n = 0;
        for rel in rels {
            let abs = fsutil::abs_path(&v.root, &rel);
            if abs.is_file() {
                fsutil::remove_file_quietly(&abs);
                n += 1;
            }
        }
        Ok(n)
    })
}

/// 启动时的一致性校验。
#[tauri::command]
pub async fn maintenance_scan(
    state: State<'_, AppState>,
) -> AppResult<crate::models::ScanReport> {
    scan_core::scan(&state)
}

#[tauri::command]
pub async fn import_existing(
    state: State<'_, AppState>,
    rels: Vec<String>,
) -> AppResult<usize> {
    scan_core::import_existing(&state, &rels)
}

#[tauri::command]
pub async fn rebuild_index(state: State<'_, AppState>) -> AppResult<usize> {
    scan_core::rebuild_index(&state)
}

/// 拖出开始：记录 images/ 的文件快照，用于检测"拖回图库目录"。
#[tauri::command]
pub async fn drag_begin(state: State<'_, AppState>) -> AppResult<usize> {
    scan_core::snapshot_images(&state)
}

/// 拖出结束：清理拖拽期间误入 images/ 的副本，返回被清理的文件。
#[tauri::command]
pub async fn drag_end_check(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    scan_core::cleanup_self_drop(&state)
}

/// 给系统拖拽用的半透明预览图（96px PNG，base64 data URL）。
#[tauri::command]
pub async fn drag_icon(state: State<'_, AppState>, id: i64) -> AppResult<String> {
    use base64::Engine;
    let root = state.root()?;
    let info = state.with_vault(|v| images_db::thumb_info(&v.conn, id))?;
    let Some((_, thumb_rel, thumb_state, _, _)) = info else {
        return Ok(String::new());
    };
    if thumb_state != 1 {
        return Ok(String::new());
    }
    let Some(rel) = thumb_rel else {
        return Ok(String::new());
    };
    let path = fsutil::abs_path(&root, &rel);
    let Ok(img) = image::open(&path) else {
        return Ok(String::new());
    };
    let thumb = if img.width() > 96 || img.height() > 96 {
        img.thumbnail(96, 96)
    } else {
        img
    };
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    if thumb
        .write_to(&mut cursor, image::ImageFormat::Png)
        .is_err()
    {
        return Ok(String::new());
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/png;base64,{encoded}"))
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub deleted: Vec<i64>,
    pub failed: Vec<String>,
}

/// 永久删除若干张图片：物理文件 + 缩略图 + 数据库记录。
#[tauri::command]
pub async fn delete_images(
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> AppResult<DeleteResult> {
    let mut deleted = Vec::new();
    let mut failed = Vec::new();
    state.with_vault(|v| {
        let rows = images_db::paths_by_ids(&v.conn, &ids)?;
        for (id, rel) in rows {
            let abs = fsutil::abs_path(&v.root, &rel);
            if abs.exists() {
                if let Err(err) = std::fs::remove_file(fsutil::fs_path(&abs)) {
                    failed.push(format!(
                        "{}：{}",
                        rel,
                        crate::error::human_io(&err)
                    ));
                    continue;
                }
            }
            for ext in ["jpg", "png"] {
                let thumb = v.root.join("thumbs").join(format!("{id}.{ext}"));
                fsutil::remove_file_quietly(&thumb);
            }
            if let Err(err) = images_db::delete(&v.conn, id) {
                failed.push(format!("{}：{}", rel, err.message));
                continue;
            }
            deleted.push(id);
        }
        Ok(())
    })?;
    Ok(DeleteResult { deleted, failed })
}
/// 给旧库中还没有内容哈希的图片补算哈希（启动后后台调用）。
#[tauri::command]
pub async fn backfill_hashes(state: State<'_, AppState>) -> AppResult<usize> {
    let root = state.root()?;
    let rows = state.with_vault(|v| images_db::scan_missing_hash(&v.conn))?;
    let mut updated = 0usize;
    for (id, rel) in rows {
        let abs = fsutil::abs_path(&root, &rel);
        if let Ok(hash) = crate::core::hash::file_hash(&abs) {
            state.with_vault(|v| images_db::set_hash(&v.conn, id, &hash))?;
            updated += 1;
        }
    }
    Ok(updated)
}
/// 重命名库内图片。
#[tauri::command]
pub async fn rename_image(
    state: State<'_, AppState>,
    id: i64,
    new_name: String,
) -> AppResult<ImageMeta> {
    manage_core::rename_image(&state, id, &new_name)
}
/// 导出图片到指定目录（copy/move）。
#[tauri::command]
pub async fn export_images(
    state: State<'_, AppState>,
    ids: Vec<i64>,
    target_dir: String,
    mode: String,
) -> AppResult<manage_core::ExportOutcome> {
    manage_core::export_images(&state, &ids, &target_dir, &mode)
}