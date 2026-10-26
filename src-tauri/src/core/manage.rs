//! 图片管理：删除、导出（拖出的服务端等价操作）、重命名。

use crate::core::{fsutil, naming};
use crate::db::images as images_db;
use crate::error::{AppError, AppResult};
use crate::models::ImageMeta;
use crate::state::AppState;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteOutcome {
    pub deleted: Vec<i64>,
    pub failed: Vec<String>,
}

/// 永久删除图片：物理文件 + 缩略图 + 数据库记录。
pub fn delete_images(state: &AppState, ids: &[i64]) -> AppResult<DeleteOutcome> {
    let mut deleted = Vec::new();
    let mut failed = Vec::new();
    state.with_vault(|v| {
        let rows = images_db::paths_by_ids(&v.conn, ids)?;
        for (id, rel) in rows {
            let abs = fsutil::abs_path(&v.root, &rel);
            if abs.exists() {
                if let Err(err) = fs::remove_file(fsutil::fs_path(&abs)) {
                    failed.push(format!("{}：{}", rel, crate::error::human_io(&err)));
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
    Ok(DeleteOutcome { deleted, failed })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOutcome {
    pub exported: Vec<i64>,
    pub failed: Vec<String>,
}

/// 把图片导出到指定目录（copy 保留库内文件；move 成功后从库中移除）。
pub fn export_images(
    state: &AppState,
    ids: &[i64],
    target_dir: &str,
    mode: &str,
) -> AppResult<ExportOutcome> {
    let target = Path::new(target_dir);
    fs::create_dir_all(fsutil::fs_path(target))
        .map_err(|e| AppError::io("无法创建导出目录", e))?;
    let mut exported = Vec::new();
    let mut failed = Vec::new();
    let move_mode = mode == "move";

    state.with_vault(|v| {
        let rows = images_db::paths_by_ids(&v.conn, ids)?;
        for (id, rel) in rows {
            let src = fsutil::abs_path(&v.root, &rel);
            if !src.is_file() {
                failed.push(format!("{}：库内文件不存在", rel));
                continue;
            }
            let name = src
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("image-{id}"));
            let dst = unique_in_dir(target, &name);
            let result = if move_mode {
                fsutil::move_or_copy(&src, &dst, "move")
            } else {
                fsutil::move_or_copy(&src, &dst, "copy")
            };
            match result {
                Ok(()) => {
                    if move_mode {
                        for ext in ["jpg", "png"] {
                            fsutil::remove_file_quietly(
                                &v.root.join("thumbs").join(format!("{id}.{ext}")),
                            );
                        }
                        images_db::delete(&v.conn, id)?;
                    }
                    exported.push(id);
                }
                Err(err) => failed.push(format!("{}：{}", rel, err.message)),
            }
        }
        Ok(())
    })?;
    Ok(ExportOutcome { exported, failed })
}

fn unique_in_dir(dir: &Path, name: &str) -> std::path::PathBuf {
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "image".to_string());
    let ext = path
        .extension()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    for index in 0..9999 {
        let candidate = if index == 0 {
            name.to_string()
        } else if ext.is_empty() {
            format!("{stem}_{index}")
        } else {
            format!("{stem}_{index}.{ext}")
        };
        if !dir.join(&candidate).exists() {
            return dir.join(candidate);
        }
    }
    dir.join(name)
}

/// 重命名库内图片（只改同一目录下的文件名）。
pub fn rename_image(state: &AppState, id: i64, new_name: &str) -> AppResult<ImageMeta> {
    let root = state.root()?;
    let row = state.with_vault(|v| {
        images_db::scan_rows(&v.conn).map(|rows| {
            rows.into_iter()
                .find(|(row_id, _, _)| *row_id == id)
                .map(|(_, rel, _)| rel)
        })
    })?;
    let Some(rel) = row else {
        return Err(AppError::new("NOT_FOUND", "图片不存在"));
    };
    let src = fsutil::abs_path(&root, &rel);
    let dir = src.parent().unwrap_or(&root).to_path_buf();
    let ext = src
        .extension()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let fallback = src
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名".to_string());
    let (base, _) = naming::sanitize_base(new_name, &fallback);
    let (base, _) = naming::truncate_base(&base, 100);

    let mut chosen = format!("{base}.{ext}");
    for index in 1..9999 {
        let candidate = format!("{base}_{index}.{ext}");
        if !dir.join(&chosen).exists() {
            break;
        }
        chosen = candidate;
    }
    let dst = dir.join(&chosen);
    fs::rename(fsutil::fs_path(&src), fsutil::fs_path(&dst))
        .map_err(|e| AppError::io("重命名失败", e))?;
    let new_rel = fsutil::rel_path_of(&root, &dst)
        .ok_or_else(|| AppError::internal("无法计算相对路径"))?;

    state.with_vault(|v| {
        images_db::update_name(&v.conn, id, &new_rel, &chosen, &base)?;
        Ok(())
    })?;

    let meta = state.with_vault(|v| {
        images_db::list(&v.conn).map(|items| items.into_iter().find(|i| i.id == id))
    })?;
    meta.ok_or_else(|| AppError::new("NOT_FOUND", "重命名后找不到图片记录"))
}
