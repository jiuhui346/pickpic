//! SQLite 打开 / 建表 / 完整性检查 / 损坏备份。

pub mod categories;
pub mod tags;
pub mod images;
pub mod settings;

use crate::error::{AppError, AppResult};
use chrono::Local;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS images (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path     TEXT    NOT NULL UNIQUE,
  file_name    TEXT    NOT NULL,
  base_name    TEXT    NOT NULL,
  ext          TEXT    NOT NULL,
  mime         TEXT    NOT NULL,
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  file_mtime   INTEGER NOT NULL,
  imported_at  INTEGER NOT NULL,
  thumb_path   TEXT,
  content_hash TEXT,
  thumb_state  INTEGER NOT NULL DEFAULT 0,
  missing      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_imported ON images(imported_at);
CREATE INDEX IF NOT EXISTS idx_images_ext      ON images(ext);
CREATE INDEX IF NOT EXISTS idx_images_missing  ON images(missing);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS image_categories (
  image_id    INTEGER NOT NULL REFERENCES images(id)     ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  added_at    INTEGER NOT NULL,
  PRIMARY KEY (image_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_imgcat_cat ON image_categories(category_id);

CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS image_tags (
  image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (image_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_imgtag_tag ON image_tags(tag_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
PRAGMA user_version = 1;
"#;

/// 打开（或创建）图库数据库。
/// 返回 `(连接, 损坏备份文件名)`；备份名非空表示发生过损坏重建。
pub fn open(root: &Path) -> AppResult<(Connection, Option<String>)> {
    fs::create_dir_all(root)
        .map_err(|e| AppError::io("无法创建存储目录", e))?;
    let db_path = root.join("vault.db");
    let mut backup_name = None;

    let conn = if db_path.exists() {
        match Connection::open(&db_path) {
            Ok(conn) => {
                if quick_check(&conn) {
                    conn
                } else {
                    drop(conn);
                    backup_name = Some(backup_database(&db_path)?);
                    Connection::open(&db_path).map_err(AppError::db)?
                }
            }
            Err(_) => {
                backup_name = Some(backup_database(&db_path)?);
                Connection::open(&db_path).map_err(AppError::db)?
            }
        }
    } else {
        Connection::open(&db_path).map_err(AppError::db)?
    };

    // WAL：崩溃后自动恢复；NORMAL 在 WAL 下足够安全。
    let _: String = conn
        .query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0))
        .map_err(AppError::db)?;
    conn.execute_batch(
        "PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    )
    .map_err(AppError::db)?;
    conn.execute_batch(SCHEMA).map_err(AppError::db)?;
    // 旧版本数据库补列（content_hash 为 v1.0.2 新增）
    let has_hash: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('images') WHERE name = 'content_hash'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_hash == 0 {
        let _ = conn.execute("ALTER TABLE images ADD COLUMN content_hash TEXT", []);
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_images_hash ON images(content_hash)",
            [],
        );
    }
    Ok((conn, backup_name))
}

/// `PRAGMA quick_check` 返回 "ok" 视为健康。
pub fn quick_check(conn: &Connection) -> bool {
    match conn.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0)) {
        Ok(v) => v.eq_ignore_ascii_case("ok"),
        Err(_) => false,
    }
}

/// 把损坏的库连同 WAL/SHM 一起改名备份，返回备份文件名。
fn backup_database(db_path: &Path) -> AppResult<String> {
    let stamp = Local::now().format("%Y%m%d-%H%M%S");
    let name = format!("vault.db.corrupt-{stamp}");
    let target = db_path.with_file_name(&name);
    fs::rename(db_path, &target).map_err(|e| AppError::io("备份损坏的数据库失败", e))?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{}", db_path.display(), suffix));
        if side.exists() {
            let backup_side = PathBuf::from(format!("{}{}", target.display(), suffix));
            let _ = fs::rename(side, backup_side);
        }
    }
    Ok(name)
}

/// 关闭前把 WAL 合并回主库，避免文件无限增长。
pub fn checkpoint(conn: &Connection) {
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn creates_schema_for_new_vault() {
        let dir = std::env::temp_dir().join(format!("iv-db-new-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let (conn, backup) = open(&dir).expect("open");
        assert!(backup.is_none());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM images", [], |r| r.get(0))
            .expect("count");
        assert_eq!(count, 0);
        drop(conn);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn backs_up_corrupt_database_and_recreates() {
        let dir = std::env::temp_dir().join(format!("iv-db-bad-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("vault.db"), b"this is definitely not sqlite").unwrap();
        let (conn, backup) = open(&dir).expect("open after corruption");
        assert!(backup.is_some(), "corrupt db should be backed up");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM images", [], |r| r.get(0))
            .expect("count");
        assert_eq!(count, 0);
        let backup_path = dir.join(backup.unwrap());
        assert!(backup_path.exists(), "backup file should exist on disk");
        drop(conn);
        let _ = fs::remove_dir_all(&dir);
    }
}
