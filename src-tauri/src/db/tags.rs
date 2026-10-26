//! tags / image_tags 表读写。

use crate::error::{AppError, AppResult};
use crate::models::Tag;
use rusqlite::{params, Connection, OptionalExtension};

pub fn list(conn: &Connection) -> AppResult<Vec<Tag>> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name,
                    (SELECT COUNT(*) FROM image_tags it WHERE it.tag_id = t.id)
             FROM tags t
             ORDER BY t.id ASC",
        )
        .map_err(AppError::db)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Tag {
                id: r.get(0)?,
                name: r.get(1)?,
                image_count: r.get(2)?,
            })
        })
        .map_err(AppError::db)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(AppError::db)?);
    }
    Ok(out)
}

pub fn create(conn: &Connection, name: &str) -> AppResult<Tag> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::new("INVALID_NAME", "标签名称不能为空"));
    }
    if name.chars().count() > 20 {
        return Err(AppError::new("INVALID_NAME", "标签名称不能超过 20 个字符"));
    }
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM tags WHERE name = ?1",
            params![name],
            |r| r.get(0),
        )
        .optional()
        .map_err(AppError::db)?;
    if let Some(id) = exists {
        return Ok(Tag {
            id,
            name: name.to_string(),
            image_count: 0,
        });
    }
    conn.execute(
        "INSERT INTO tags (name, created_at) VALUES (?1, ?2)",
        params![name, chrono::Local::now().timestamp()],
    )
    .map_err(AppError::db)?;
    Ok(Tag {
        id: conn.last_insert_rowid(),
        name: name.to_string(),
        image_count: 0,
    })
}

pub fn assign(conn: &Connection, image_ids: &[i64], tag_id: i64) -> AppResult<()> {
    let now = chrono::Local::now().timestamp();
    let mut stmt = conn
        .prepare("INSERT OR IGNORE INTO image_tags (image_id, tag_id, added_at) VALUES (?1, ?2, ?3)")
        .map_err(AppError::db)?;
    for id in image_ids {
        stmt.execute(params![id, tag_id, now])
            .map_err(AppError::db)?;
    }
    Ok(())
}

pub fn unassign(conn: &Connection, image_ids: &[i64], tag_id: i64) -> AppResult<()> {
    let mut stmt = conn
        .prepare("DELETE FROM image_tags WHERE image_id = ?1 AND tag_id = ?2")
        .map_err(AppError::db)?;
    for id in image_ids {
        stmt.execute(params![id, tag_id]).map_err(AppError::db)?;
    }
    Ok(())
}
