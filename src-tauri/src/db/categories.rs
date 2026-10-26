//! categories / image_categories 表读写。

use crate::error::{AppError, AppResult};
use crate::models::Category;
use rusqlite::{params, Connection, OptionalExtension};

pub fn list(conn: &Connection) -> AppResult<Vec<Category>> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.name, c.sort_order, c.created_at,
                    (SELECT COUNT(*) FROM image_categories ic WHERE ic.category_id = c.id)
             FROM categories c
             ORDER BY c.sort_order ASC, c.id ASC",
        )
        .map_err(AppError::db)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Category {
                id: r.get(0)?,
                name: r.get(1)?,
                sort_order: r.get(2)?,
                created_at: r.get(3)?,
                image_count: r.get(4)?,
            })
        })
        .map_err(AppError::db)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(AppError::db)?);
    }
    Ok(out)
}

fn name_taken(conn: &Connection, name: &str, except_id: Option<i64>) -> AppResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT id FROM categories WHERE name = ?1 AND id IS NOT ?2",
            params![name, except_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(AppError::db)?;
    Ok(found.is_some())
}

pub fn create(conn: &Connection, name: &str) -> AppResult<Category> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::new("INVALID_NAME", "分类名称不能为空"));
    }
    if name.chars().count() > 40 {
        return Err(AppError::new("INVALID_NAME", "分类名称不能超过 40 个字符"));
    }
    if name_taken(conn, name, None)? {
        return Err(AppError::new("DUPLICATE", "已存在同名分类"));
    }
    let now = chrono::Local::now().timestamp();
    let sort_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1);
    conn.execute(
        "INSERT INTO categories (name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![name, sort_order, now],
    )
    .map_err(AppError::db)?;
    let id = conn.last_insert_rowid();
    Ok(Category {
        id,
        name: name.to_string(),
        sort_order,
        created_at: now,
        image_count: 0,
    })
}

pub fn rename(conn: &Connection, id: i64, name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::new("INVALID_NAME", "分类名称不能为空"));
    }
    if name.chars().count() > 40 {
        return Err(AppError::new("INVALID_NAME", "分类名称不能超过 40 个字符"));
    }
    if name_taken(conn, name, Some(id))? {
        return Err(AppError::new("DUPLICATE", "已存在同名分类"));
    }
    let changed = conn
        .execute(
            "UPDATE categories SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, name, chrono::Local::now().timestamp()],
        )
        .map_err(AppError::db)?;
    if changed == 0 {
        return Err(AppError::new("NOT_FOUND", "分类不存在"));
    }
    Ok(())
}

/// 删除分类：只删分类本身（关联行级联删除），图片记录与文件保持不动。
pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM categories WHERE id = ?1", params![id])
        .map_err(AppError::db)?;
    Ok(())
}

pub fn assign(conn: &Connection, image_ids: &[i64], category_id: i64) -> AppResult<()> {
    let now = chrono::Local::now().timestamp();
    let mut stmt = conn
        .prepare(
            "INSERT OR IGNORE INTO image_categories (image_id, category_id, added_at)
             VALUES (?1, ?2, ?3)",
        )
        .map_err(AppError::db)?;
    for id in image_ids {
        stmt.execute(params![id, category_id, now])
            .map_err(AppError::db)?;
    }
    Ok(())
}

pub fn unassign(conn: &Connection, image_ids: &[i64], category_id: i64) -> AppResult<()> {
    let mut stmt = conn
        .prepare("DELETE FROM image_categories WHERE image_id = ?1 AND category_id = ?2")
        .map_err(AppError::db)?;
    for id in image_ids {
        stmt.execute(params![id, category_id])
            .map_err(AppError::db)?;
    }
    Ok(())
}
