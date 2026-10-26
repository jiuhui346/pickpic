//! 启动一致性校验、孤儿文件入库、拖出快照。

use crate::core::{fsutil, meta};
use crate::db::images as images_db;
use crate::error::{AppError, AppResult};
use crate::models::ScanReport;
use crate::state::AppState;
use std::collections::HashSet;
use walkdir::WalkDir;

/// 对比数据库与磁盘：标记缺失文件，列出未入库文件（相对路径）。
pub fn scan(state: &AppState) -> AppResult<ScanReport> {
    state.with_vault(|v| {
        let rows = images_db::scan_rows(&v.conn)?;
        let mut known: HashSet<String> = HashSet::new();
        let mut missing = 0i64;

        let tx = v.conn.unchecked_transaction().map_err(AppError::db)?;
        for (id, rel, was_missing) in &rows {
            known.insert(rel.clone());
            let exists = fsutil::abs_path(&v.root, rel).is_file();
            if !exists {
                missing += 1;
            }
            if exists == *was_missing {
                tx.execute(
                    "UPDATE images SET missing = ?2 WHERE id = ?1",
                    rusqlite::params![id, if exists { 0 } else { 1 }],
                )
                .map_err(AppError::db)?;
            }
        }
        tx.commit().map_err(AppError::db)?;

        let mut orphans = Vec::new();
        let images_root = v.root.join("images");
        if images_root.exists() {
            for entry in WalkDir::new(fsutil::fs_path(&images_root))
                .follow_links(false)
                .into_iter()
                .filter_map(Result::ok)
            {
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                if !meta::ext_of(path)
                    .map(|e| meta::is_supported(&e))
                    .unwrap_or(false)
                {
                    continue;
                }
                if let Some(rel) = fsutil::rel_path_of(&v.root, path) {
                    if !known.contains(&rel) {
                        orphans.push(rel);
                    }
                }
            }
        }
        Ok(ScanReport { missing, orphans })
    })
}

/// 把磁盘上已存在、但未入库的图片补登记（不改名、不移动）。
pub fn import_existing(state: &AppState, rels: &[String]) -> AppResult<usize> {
    state.with_vault(|v| {
        let mut imported = 0usize;
        for rel in rels {
            let abs = fsutil::abs_path(&v.root, rel);
            if !abs.is_file() {
                continue;
            }
            let ext = match meta::ext_of(&abs) {
                Some(e) if meta::is_supported(&e) => e,
                _ => continue,
            };
            if images_db::exists_rel(&v.conn, rel)? {
                continue;
            }
            let name = abs
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let base = abs
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let (size, mtime) = meta::file_facts(&abs).unwrap_or((0, 0));
            let (w, h) = meta::read_dimensions(&abs, &ext);
            images_db::insert(
                &v.conn,
                &images_db::NewImage {
                    rel_path: rel,
                    file_name: &name,
                    base_name: &base,
                    ext: &ext,
                    mime: meta::mime_of(&ext),
                    size_bytes: size,
                    width: w,
                    height: h,
                    file_mtime: mtime,
                    imported_at: chrono::Local::now().timestamp(),
                    content_hash: crate::core::hash::file_hash(&abs).ok().as_deref(),
                },
            )?;
            imported += 1;
        }
        Ok(imported)
    })
}

/// 全量重建索引：扫描 images/，把所有未入库图片登记进来（数据库损坏后的恢复路径）。
pub fn rebuild_index(state: &AppState) -> AppResult<usize> {
    let report = scan(state)?;
    if report.orphans.is_empty() {
        return Ok(0);
    }
    import_existing(state, &report.orphans)
}

/// 收集 images/ 下所有图片的相对路径。
fn collect_image_files(state: &AppState) -> AppResult<Vec<String>> {
    state.with_vault(|v| {
        let mut files = Vec::new();
        let images_root = v.root.join("images");
        if images_root.exists() {
            for entry in WalkDir::new(fsutil::fs_path(&images_root))
                .follow_links(false)
                .into_iter()
                .filter_map(Result::ok)
            {
                if !entry.file_type().is_file() {
                    continue;
                }
                if !meta::ext_of(entry.path())
                    .map(|e| meta::is_supported(&e))
                    .unwrap_or(false)
                {
                    continue;
                }
                if let Some(rel) = fsutil::rel_path_of(&v.root, entry.path()) {
                    files.push(rel);
                }
            }
        }
        Ok(files)
    })
}

/// 拖出开始：记录当前文件快照。
pub fn snapshot_images(state: &AppState) -> AppResult<usize> {
    let files = collect_image_files(state)?;
    let count = files.len();
    if let Ok(mut guard) = state.drag_guard.lock() {
        *guard = Some(files.into_iter().collect());
    }
    Ok(count)
}

/// 拖出结束：若 images/ 下出现新文件，判定拖回了库目录，删除并返回文件名。
pub fn cleanup_self_drop(state: &AppState) -> AppResult<Vec<String>> {
    let snapshot = state.drag_guard.lock().ok().and_then(|mut g| g.take());
    let Some(snapshot) = snapshot else {
        return Ok(Vec::new());
    };
    let files = collect_image_files(state)?;
    let new_files: Vec<String> = files
        .into_iter()
        .filter(|rel| !snapshot.contains(rel))
        .collect();
    if new_files.is_empty() {
        return Ok(Vec::new());
    }
    let root = state.root()?;
    for rel in &new_files {
        let abs = fsutil::abs_path(&root, rel);
        fsutil::remove_file_quietly(&abs);
    }
    Ok(new_files)
}
