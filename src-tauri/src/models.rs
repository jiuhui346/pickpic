//! 前后端共享的数据结构（serde 统一 camelCase）。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMeta {
    pub id: i64,
    pub rel_path: String,
    pub file_name: String,
    pub base_name: String,
    pub ext: String,
    pub size_bytes: i64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub mtime: i64,
    pub imported_at: i64,
    pub thumb_state: i32,
    pub missing: bool,
    pub categories: Vec<i64>,
    pub tags: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub image_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
    pub created_at: i64,
    pub image_count: i64,
}

pub fn default_shortcuts() -> String {
    r#"{"preview":"Enter","toggleSelect":"Space","selectAll":"Ctrl+A","delete":"Delete","settings":"Ctrl+,","previewPrev":"ArrowLeft","previewNext":"ArrowRight"}"#.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub import_mode: String,
    pub export_mode: String,
    pub thumb_size: String,
    pub theme: String,
    pub sort_field: String,
    pub sort_desc: bool,
    /// 快捷键绑定（JSON 字符串）
    pub shortcuts: String,
    /// 简洁模式：隐藏所有小字提示
    pub hide_hints: bool,
    /// 网格中直接播放动图（GIF / 动态 WebP）
    pub animate_thumbs: bool,
    /// 全局呼出快捷键（如 Ctrl+Alt+P）
    pub global_shortcut: String,
    /// 本地 MCP 服务开关
    pub mcp_enabled: bool,
    pub mcp_port: u16,
    pub mcp_token: String,
    /// 插件源 index.json 地址（GitHub/CDN）
    pub plugin_repo_url: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            import_mode: "move".into(),
            export_mode: "copy".into(),
            thumb_size: "small".into(),
            theme: "dark".into(),
            sort_field: "imported".into(),
            sort_desc: true,
            shortcuts: default_shortcuts(),
            hide_hints: false,
            animate_thumbs: false,
            global_shortcut: "Ctrl+Alt+P".into(),
            mcp_enabled: false,
            mcp_port: 45871,
            mcp_token: String::new(),
            plugin_repo_url: String::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub import_mode: Option<String>,
    pub export_mode: Option<String>,
    pub thumb_size: Option<String>,
    pub theme: Option<String>,
    pub sort_field: Option<String>,
    pub sort_desc: Option<bool>,
    pub shortcuts: Option<String>,
    pub hide_hints: Option<bool>,
    pub animate_thumbs: Option<bool>,
    pub global_shortcut: Option<String>,
    pub mcp_enabled: Option<bool>,
    pub mcp_port: Option<u16>,
    pub mcp_token: Option<String>,
    pub plugin_repo_url: Option<String>,
}

impl Settings {
    /// 逐字段应用补丁，并校验取值，非法值直接忽略（保持原值）。
    pub fn apply(&mut self, patch: &SettingsPatch) {
        if let Some(v) = &patch.import_mode {
            if v == "move" || v == "copy" {
                self.import_mode = v.clone();
            }
        }
        if let Some(v) = &patch.export_mode {
            if v == "copy" || v == "move" {
                self.export_mode = v.clone();
            }
        }
        if let Some(v) = &patch.thumb_size {
            if ["small", "medium", "large"].contains(&v.as_str()) {
                self.thumb_size = v.clone();
            }
        }
        if let Some(v) = &patch.theme {
            if ["dark", "light", "system"].contains(&v.as_str()) {
                self.theme = v.clone();
            }
        }
        if let Some(v) = &patch.sort_field {
            if ["name", "size", "mtime", "imported", "ext"].contains(&v.as_str()) {
                self.sort_field = v.clone();
            }
        }
        if let Some(v) = patch.sort_desc {
            self.sort_desc = v;
        }
        if let Some(v) = &patch.shortcuts {
            if v.len() <= 4096 && serde_json::from_str::<serde_json::Value>(v).is_ok() {
                self.shortcuts = v.clone();
            }
        }
        if let Some(v) = patch.hide_hints {
            self.hide_hints = v;
        }
        if let Some(v) = patch.animate_thumbs {
            self.animate_thumbs = v;
        }
        if let Some(v) = &patch.global_shortcut {
            if v.len() <= 64 {
                self.global_shortcut = v.clone();
            }
        }
        if let Some(v) = patch.mcp_enabled {
            self.mcp_enabled = v;
        }
        if let Some(v) = patch.mcp_port {
            if v > 1024 {
                self.mcp_port = v;
            }
        }
        if let Some(v) = &patch.mcp_token {
            if v.len() <= 128 {
                self.mcp_token = v.clone();
            }
        }
        if let Some(v) = &patch.plugin_repo_url {
            if v.len() <= 512 {
                self.plugin_repo_url = v.trim().to_string();
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub configured: bool,
    pub ready: bool,
    pub root: Option<String>,
    pub error: Option<String>,
    pub recovered_backup: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub root: String,
    pub image_count: i64,
    pub total_bytes: i64,
    /// 打开时发现数据库损坏并重建时的备份文件名
    pub recovered_backup: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectedFile {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirCandidate {
    pub path: String,
    pub image_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub images: Vec<String>,
    pub dirs: Vec<DirCandidate>,
    pub rejected: Vec<RejectedFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateInfo {
    pub id: i64,
    pub file_name: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub image: ImageMeta,
    pub final_name: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbResult {
    /// "ready" | "broken"
    pub state: String,
    pub path: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub missing: i64,
    pub orphans: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateProgress {
    pub done: usize,
    pub total: usize,
    pub current: String,
}
