//! 轻量插件系统：插件目录 + plugin.json + main.js（在 WebView 内执行，可调用受限 API）。
//! 插件是受信任的本地代码，安装前请自行确认来源。

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub enabled: bool,
    pub error: Option<String>,
    pub path: String,
}

fn base_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(base).join("PickPic")
}

pub fn plugins_dir() -> PathBuf {
    base_dir().join("plugins")
}

fn state_path() -> PathBuf {
    base_dir().join("plugins.json")
}

fn load_state() -> HashMap<String, bool> {
    fs::read_to_string(state_path())
        .ok()
        .and_then(|text| serde_json::from_str::<HashMap<String, bool>>(&text).ok())
        .unwrap_or_default()
}

fn save_state(state: &HashMap<String, bool>) -> Result<(), String> {
    let path = state_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, serde_json::to_string_pretty(state).unwrap_or_default())
        .map_err(|e| e.to_string())
}

fn read_manifest(dir: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(dir.join("plugin.json"))
        .map_err(|_| "缺少 plugin.json".to_string())?;
    serde_json::from_str(&text).map_err(|e| format!("plugin.json 解析失败：{e}"))
}

pub fn list() -> Result<Vec<PluginInfo>, String> {
    let dir = plugins_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let state = load_state();
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let path = entry.path();
        let folder = entry.file_name().to_string_lossy().to_string();
        match read_manifest(&path) {
            Ok(manifest) => {
                let id = manifest
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&folder)
                    .to_string();
                let main = manifest
                    .get("main")
                    .and_then(|v| v.as_str())
                    .unwrap_or("main.js");
                let error = if path.join(main).is_file() {
                    None
                } else {
                    Some(format!("缺少入口文件 {main}"))
                };
                out.push(PluginInfo {
                    id: id.clone(),
                    name: manifest
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&folder)
                        .to_string(),
                    version: manifest
                        .get("version")
                        .and_then(|v| v.as_str())
                        .unwrap_or("0.0.0")
                        .to_string(),
                    description: manifest
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    enabled: *state.get(&id).unwrap_or(&false),
                    error,
                    path: path.to_string_lossy().to_string(),
                });
            }
            Err(err) => out.push(PluginInfo {
                id: folder.clone(),
                name: folder.clone(),
                version: "-".to_string(),
                description: String::new(),
                enabled: false,
                error: Some(err),
                path: path.to_string_lossy().to_string(),
            }),
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn code(id: &str) -> Result<String, String> {
    let dir = plugins_dir();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let path = entry.path();
        let Ok(manifest) = read_manifest(&path) else {
            continue;
        };
        let folder = entry.file_name().to_string_lossy().to_string();
        let plugin_id = manifest.get("id").and_then(|v| v.as_str()).unwrap_or(&folder);
        if plugin_id != id {
            continue;
        }
        let main = manifest
            .get("main")
            .and_then(|v| v.as_str())
            .unwrap_or("main.js");
        return fs::read_to_string(path.join(main)).map_err(|e| e.to_string());
    }
    Err("插件不存在".to_string())
}

pub fn set_enabled(id: &str, enabled: bool) -> Result<(), String> {
    let mut state = load_state();
    state.insert(id.to_string(), enabled);
    save_state(&state)
}

/// 从本地文件夹安装插件（复制到插件目录，默认禁用）。
pub fn install(source: &str) -> Result<(), String> {
    let src = Path::new(source);
    if !src.is_dir() {
        return Err("请选择一个插件文件夹".to_string());
    }
    read_manifest(src)?;
    let dir = plugins_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let folder = src
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "plugin".to_string());
    let mut target = dir.join(&folder);
    let mut index = 1;
    while target.exists() {
        target = dir.join(format!("{folder}_{index}"));
        index += 1;
    }
    copy_dir(src, &target)?;
    Ok(())
}

fn copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let out = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir(&path, &out)?;
        } else {
            fs::copy(&path, &out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn open_dir() -> Result<(), String> {
    let dir = plugins_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub homepage: String,
    pub files: Vec<String>,
}

fn http_get(url: &str, limit: u64) -> Result<String, String> {
    // 用系统 curl：能正确处理 IPv4/IPv6 回退与 TLS，避免 ureq 在部分网络下连不上 CDN。
    let output = std::process::Command::new("curl.exe")
        .args([
            "-fsSL",
            "--max-time",
            "20",
            "--max-filesize",
            &limit.to_string(),
            url,
        ])
        .output()
        .map_err(|e| format!("无法调用 curl：{e}"))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("请求失败：{message}"));
    }
    if output.stdout.len() as u64 > limit {
        return Err("响应内容过大".to_string());
    }
    String::from_utf8(output.stdout).map_err(|e| format!("响应不是 UTF-8：{e}"))
}

/// 拉取插件源 index.json。
pub fn fetch_repo(index_url: &str) -> Result<Vec<RemotePlugin>, String> {
    let url = index_url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://127.0.0.1")) {
        return Err("插件源必须是 https:// 地址".to_string());
    }
    let text = http_get(url, 512 * 1024)?;
    let value: Value = serde_json::from_str(&text).map_err(|e| format!("index.json 解析失败：{e}"))?;
    let array = value
        .get("plugins")
        .and_then(|v| v.as_array())
        .cloned()
        .or_else(|| value.as_array().cloned())
        .ok_or_else(|| "index.json 缺少 plugins 数组".to_string())?;
    let mut out = Vec::new();
    for item in array {
        let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            continue;
        }
        let files = item
            .get("files")
            .and_then(|v| v.as_array())
            .map(|list| {
                list.iter()
                    .filter_map(|f| f.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .filter(|list| !list.is_empty())
            .unwrap_or_else(|| vec!["plugin.json".to_string(), "main.js".to_string()]);
        out.push(RemotePlugin {
            id,
            name: item.get("name").and_then(|v| v.as_str()).unwrap_or("未命名插件").to_string(),
            version: item.get("version").and_then(|v| v.as_str()).unwrap_or("0.0.0").to_string(),
            description: item.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            author: item.get("author").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            homepage: item.get("homepage").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            files,
        });
    }
    Ok(out)
}

/// 从插件源下载并安装（覆盖旧版本；启用状态保留）。
pub fn install_from_repo(index_url: &str, plugin_id: &str) -> Result<(), String> {
    let url = index_url.trim();
    let list = fetch_repo(url)?;
    let item = list
        .into_iter()
        .find(|p| p.id == plugin_id)
        .ok_or_else(|| "插件源里没有这个插件".to_string())?;
    let base = url
        .rsplit_once('/')
        .map(|(base, _)| base.to_string())
        .ok_or_else(|| "插件源地址不合法".to_string())?;
    let dir = plugins_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!(".tmp-{}", uuid::Uuid::new_v4().simple()));
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;

    for file in &item.files {
        let relative = Path::new(file);
        if relative.is_absolute() || file.contains("..") {
            return Err("插件文件路径不合法".to_string());
        }
        let file_url = format!("{base}/{plugin_id}/{file}");
        let body = http_get(&file_url, 2 * 1024 * 1024)?;
        let target = tmp.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, body).map_err(|e| e.to_string())?;
    }

    let manifest = read_manifest(&tmp)?;
    let manifest_id = manifest.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if manifest_id != plugin_id {
        let _ = fs::remove_dir_all(&tmp);
        return Err("插件包里的 id 与插件源不一致".to_string());
    }

    let target = dir.join(plugin_id);
    if target.exists() {
        let backup = dir.join(format!(".old-{}", uuid::Uuid::new_v4().simple()));
        fs::rename(&target, &backup).map_err(|e| e.to_string())?;
        if let Err(err) = fs::rename(&tmp, &target) {
            let _ = fs::rename(&backup, &target);
            return Err(err.to_string());
        }
        let _ = fs::remove_dir_all(&backup);
    } else {
        fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    }
    Ok(())
}
