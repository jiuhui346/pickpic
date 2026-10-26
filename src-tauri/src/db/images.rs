//! images 表读写。

use crate::error::{AppError, AppResult};
use crate::models::ImageMeta;
use rusqlite::{params, Connection, OptionalExtension};

/// 全量读取图片元数据（1 万条约 2–4 MB，一次性给前端）。
pub fn list(conn: &Connection) -> AppResult<Vec<ImageMeta>> {
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.rel_path, i.file_name, i.base_name, i.ext, i.size_bytes, i.width, i.height,
                    i.file_mtime, i.imported_at, i.thumb_state, i.missing,
                    (SELECT GROUP_CONCAT(ic.category_id) FROM image_categories ic WHERE ic.image_id = i.id),
                    (SELECT GROUP_CONCAT(it.tag_id) FROM image_tags it WHERE it.image_id = i.id)
             FROM images i
             ORDER BY i.id DESC",
        )
        .map_err(AppError::db)?;
    let rows = stmt
        .query_map([], |row| {
            let cats: Option<String> = row.get(12)?;
            let tags: Option<String> = row.get(13)?;
            Ok(ImageMeta {
                id: row.get(0)?,
                rel_path: row.get(1)?,
                file_name: row.get(2)?,
                base_name: row.get(3)?,
                ext: row.get(4)?,
                size_bytes: row.get(5)?,
                width: row.get(6)?,
                height: row.get(7)?,
                mtime: row.get(8)?,
                imported_at: row.get(9)?,
                thumb_state: row.get(10)?,
                missing: row.get::<_, i64>(11)? != 0,
                categories: cats
                    .map(|s| s.split(',').filter_map(|v| v.parse::<i64>().ok()).collect())
                    .unwrap_or_default(),
                tags: tags
                    .map(|s| s.split(',').filter_map(|v| v.parse::<i64>().ok()).collect())
                    .unwrap_or_default(),
            })
        })
        .map_err(AppError::db)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(AppError::db)?);
    }
    Ok(out)
}

pub struct NewImage<'a> {
    pub rel_path: &'a str,
    pub file_name: &'a str,
    pub base_name: &'a str,
    pub ext: &'a str,
    pub mime: &'a str,
    pub size_bytes: i64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub file_mtime: i64,
    pub imported_at: i64,
    pub content_hash: Option<&'a str>,
}

pub fn insert(conn: &Connection, img: &NewImage<'_>) -> AppResult<i64> {
    let now = chrono::Local::now().timestamp();
    conn.execute(
        "INSERT INTO images
         (rel_path, file_name, base_name, ext, mime, size_bytes, width, height,
          file_mtime, imported_at, content_hash, thumb_state, missing, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, 0, ?12, ?12)",
        params![
            img.rel_path,
            img.file_name,
            img.base_name,
            img.ext,
            img.mime,
            img.size_bytes,
            img.width,
            img.height,
            img.file_mtime,
            img.imported_at,
            img.content_hash,
            now,
        ],
    )
    .map_err(AppError::db)?;
    Ok(conn.last_insert_rowid())
}

pub fn update_thumb(
    conn: &Connection,
    id: i64,
    thumb_rel: Option<&str>,
    state: i32,
    width: Option<u32>,
    height: Option<u32>,
) -> AppResult<()> {
    conn.execute(
        "UPDATE images SET thumb_path = ?2, thumb_state = ?3,
            width = COALESCE(?4, width), height = COALESCE(?5, height),
            updated_at = ?6
         WHERE id = ?1",
        params![
            id,
            thumb_rel,
            state,
            width,
            height,
            chrono::Local::now().timestamp()
        ],
    )
    .map_err(AppError::db)?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM images WHERE id = ?1", params![id])
        .map_err(AppError::db)?;
    Ok(())
}

/// 取若干张图的物理路径（用于拖出 / 移动出库）。
pub fn paths_by_ids(conn: &Connection, ids: &[i64]) -> AppResult<Vec<(i64, String)>> {
    let mut out = Vec::new();
    let mut stmt = conn
        .prepare("SELECT id, rel_path FROM images WHERE id = ?1")
        .map_err(AppError::db)?;
    for id in ids {
        let row = stmt
            .query_row(params![id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .optional()
            .map_err(AppError::db)?;
        if let Some(v) = row {
            out.push(v);
        }
    }
    Ok(out)
}

/// 按内容哈希查已有图片（重复检测）。
pub fn find_by_hash(conn: &Connection, hash: &str) -> AppResult<Option<(i64, String, i64)>> {
    conn.query_row(
        "SELECT id, file_name, size_bytes FROM images WHERE content_hash = ?1 LIMIT 1",
        params![hash],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .optional()
    .map_err(AppError::db)
}

pub fn exists_rel(conn: &Connection, rel_path: &str) -> AppResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT id FROM images WHERE rel_path = ?1",
            params![rel_path],
            |r| r.get(0),
        )
        .optional()
        .map_err(AppError::db)?;
    Ok(found.is_some())
}

pub fn stats(conn: &Connection) -> AppResult<(i64, i64)> {
    conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM images",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .map_err(AppError::db)
}

/// 一致性扫描用：id + 相对路径 + 当前 missing 标记。
pub fn scan_rows(conn: &Connection) -> AppResult<Vec<(i64, String, bool)>> {
    let mut stmt = conn
        .prepare("SELECT id, rel_path, missing FROM images")
        .map_err(AppError::db)?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)? != 0,
            ))
        })
        .map_err(AppError::db)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(AppError::db)?);
    }
    Ok(out)
}

pub fn thumb_info(
    conn: &Connection,
    id: i64,
) -> AppResult<Option<(String, Option<String>, i32, Option<u32>, Option<u32>)>> {
    conn.query_row(
        "SELECT rel_path, thumb_path, thumb_state, width, height FROM images WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )
    .optional()
    .map_err(AppError::db)
}

/// 尚无内容哈希的记录（用于旧库补齐）。
pub fn scan_missing_hash(conn: &Connection) -> AppResult<Vec<(i64, String)>> {
    let mut stmt = conn
        .prepare("SELECT id, rel_path FROM images WHERE content_hash IS NULL OR content_hash = ''")
        .map_err(AppError::db)?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(AppError::db)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(AppError::db)?);
    }
    Ok(out)
}

pub fn set_hash(conn: &Connection, id: i64, hash: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE images SET content_hash = ?2 WHERE id = ?1",
        params![id, hash],
    )
    .map_err(AppError::db)?;
    Ok(())
}
pub fn update_name(
    conn: &Connection,
    id: i64,
    rel_path: &str,
    file_name: &str,
    base_name: &str,
) -> AppResult<()> {
    conn.execute(
        "UPDATE images SET rel_path = ?2, file_name = ?3, base_name = ?4, updated_at = ?5 WHERE id = ?1",
        params![id, rel_path, file_name, base_name, chrono::Local::now().timestamp()],
    )
    .map_err(AppError::db)?;
    Ok(())
}