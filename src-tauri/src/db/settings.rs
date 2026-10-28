//! settings 表读写。

use crate::error::AppResult;
use crate::models::Settings;
use rusqlite::{params, Connection, OptionalExtension};

fn get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

/// 读取设置；缺失或非法值回落到默认值。
pub fn load(conn: &Connection) -> Settings {
    let mut s = Settings::default();
    if let Some(v) = get(conn, "import_mode") {
        if v == "move" || v == "copy" {
            s.import_mode = v;
        }
    }
    if let Some(v) = get(conn, "export_mode") {
        if v == "copy" || v == "move" {
            s.export_mode = v;
        }
    }
    if let Some(v) = get(conn, "thumb_size") {
        if ["small", "medium", "large"].contains(&v.as_str()) {
            s.thumb_size = v;
        }
    }
    if let Some(v) = get(conn, "theme") {
        if ["dark", "light", "system"].contains(&v.as_str()) {
            s.theme = v;
        }
    }
    if let Some(v) = get(conn, "sort_field") {
        if ["name", "size", "mtime", "imported", "ext"].contains(&v.as_str()) {
            s.sort_field = v;
        }
    }
    if let Some(v) = get(conn, "sort_desc") {
        s.sort_desc = v == "1";
    }
    if let Some(v) = get(conn, "shortcuts") {
        if serde_json::from_str::<serde_json::Value>(&v).is_ok() {
            s.shortcuts = v;
        }
    }
    if let Some(v) = get(conn, "hide_hints") {
        s.hide_hints = v == "1";
    }
    if let Some(v) = get(conn, "animate_thumbs") {
        s.animate_thumbs = v == "1";
    }
    if let Some(v) = get(conn, "global_shortcut") {
        s.global_shortcut = v;
    }
    if let Some(v) = get(conn, "mcp_enabled") {
        s.mcp_enabled = v == "1";
    }
    if let Some(v) = get(conn, "mcp_port") {
        if let Ok(port) = v.parse::<u16>() {
            s.mcp_port = port;
        }
    }
    if let Some(v) = get(conn, "mcp_token") {
        s.mcp_token = v;
    }
    if let Some(v) = get(conn, "plugin_repo_url") {
        s.plugin_repo_url = v;
    }
    s
}

pub fn save(conn: &Connection, s: &Settings) -> AppResult<()> {
    let pairs = [
        ("import_mode", s.import_mode.clone()),
        ("export_mode", s.export_mode.clone()),
        ("thumb_size", s.thumb_size.clone()),
        ("theme", s.theme.clone()),
        ("sort_field", s.sort_field.clone()),
        ("sort_desc", if s.sort_desc { "1" } else { "0" }.to_string()),
        ("shortcuts", s.shortcuts.clone()),
        ("hide_hints", if s.hide_hints { "1" } else { "0" }.to_string()),
        ("animate_thumbs", if s.animate_thumbs { "1" } else { "0" }.to_string()),
        ("global_shortcut", s.global_shortcut.clone()),
        ("mcp_enabled", if s.mcp_enabled { "1" } else { "0" }.to_string()),
        ("mcp_port", s.mcp_port.to_string()),
        ("mcp_token", s.mcp_token.clone()),
        ("plugin_repo_url", s.plugin_repo_url.clone()),
    ];
    let mut stmt = conn
        .prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")?;
    for (k, v) in pairs {
        stmt.execute(params![k, v])?;
    }
    Ok(())
}
