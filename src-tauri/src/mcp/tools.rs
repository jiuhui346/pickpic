//! MCP 工具实现：把用户可执行的操作映射成 MCP tools。

use crate::core::import as import_core;
use crate::core::manage as manage_core;
use crate::core::scan as scan_core;
use crate::db::{categories as categories_db, images as images_db, settings as settings_db, tags as tags_db};
use crate::models::SettingsPatch;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub fn tools() -> Value {
    json!([
        {
            "name": "vault_info",
            "description": "查看当前图库的根目录、图片数量与总容量",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "list_images",
            "description": "列出图片，可按分类、标签、缺失状态和关键字过滤",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "categoryId": {"type": "number", "description": "分类 id；传 0 表示未分类"},
                    "tagId": {"type": "number", "description": "标签 id"},
                    "query": {"type": "string", "description": "文件名关键字"},
                    "missingOnly": {"type": "boolean"},
                    "limit": {"type": "number", "description": "默认 200"},
                    "offset": {"type": "number"}
                }
            }
        },
        {
            "name": "get_image",
            "description": "按 id 获取单张图片的元数据",
            "inputSchema": {"type": "object", "properties": {"id": {"type": "number"}}, "required": ["id"]}
        },
        {
            "name": "import_images",
            "description": "把磁盘上的图片导入图库（等同于拖入）。move 会移动原文件，copy 保留",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "paths": {"type": "array", "items": {"type": "string"}},
                    "names": {"type": "object", "description": "可选：路径 -> 文件名（不含扩展名）"},
                    "categoryId": {"type": "number"},
                    "tagId": {"type": "number"},
                    "mode": {"type": "string", "enum": ["move", "copy"]}
                },
                "required": ["paths"]
            }
        },
        {
            "name": "rename_image",
            "description": "重命名图库内的图片（同目录内改名）",
            "inputSchema": {
                "type": "object",
                "properties": {"id": {"type": "number"}, "newName": {"type": "string"}},
                "required": ["id", "newName"]
            }
        },
        {
            "name": "delete_images",
            "description": "永久删除图片（文件 + 缩略图 + 数据库记录）",
            "inputSchema": {
                "type": "object",
                "properties": {"ids": {"type": "array", "items": {"type": "number"}}},
                "required": ["ids"]
            }
        },
        {
            "name": "export_images",
            "description": "把图片导出到指定目录（拖出的服务端等价操作）",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "ids": {"type": "array", "items": {"type": "number"}},
                    "targetDir": {"type": "string"},
                    "mode": {"type": "string", "enum": ["copy", "move"]}
                },
                "required": ["ids", "targetDir"]
            }
        },
        {
            "name": "list_categories",
            "description": "列出所有分类及图片数量",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "create_category",
            "description": "新建分类",
            "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}
        },
        {
            "name": "rename_category",
            "description": "重命名分类",
            "inputSchema": {
                "type": "object",
                "properties": {"id": {"type": "number"}, "name": {"type": "string"}},
                "required": ["id", "name"]
            }
        },
        {
            "name": "delete_category",
            "description": "删除分类（只解除关联，不删图片）",
            "inputSchema": {"type": "object", "properties": {"id": {"type": "number"}}, "required": ["id"]}
        },
        {
            "name": "assign_category",
            "description": "把图片归入/移出分类",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "imageIds": {"type": "array", "items": {"type": "number"}},
                    "categoryId": {"type": "number"},
                    "assign": {"type": "boolean", "description": "true 添加，false 移除"}
                },
                "required": ["imageIds", "categoryId"]
            }
        },
        {
            "name": "list_tags",
            "description": "列出所有标签",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "create_tag",
            "description": "新建标签",
            "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}
        },
        {
            "name": "assign_tag",
            "description": "给图片添加/移除标签",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "imageIds": {"type": "array", "items": {"type": "number"}},
                    "tagId": {"type": "number"},
                    "assign": {"type": "boolean"}
                },
                "required": ["imageIds", "tagId"]
            }
        },
        {
            "name": "get_settings",
            "description": "读取当前设置",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "update_settings",
            "description": "更新设置（importMode/exportMode/thumbSize/theme/sortField/sortDesc/hideHints/animateThumbs 等）",
            "inputSchema": {"type": "object", "properties": {"patch": {"type": "object"}}, "required": ["patch"]}
        },
        {
            "name": "scan_library",
            "description": "一致性校验：标记缺失文件、列出未入库文件",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "plugins_list",
            "description": "列出已安装插件及启用状态",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "plugin_set_enabled",
            "description": "启用/禁用插件",
            "inputSchema": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "enabled": {"type": "boolean"}},
                "required": ["id", "enabled"]
            }
        }
    ])
}

pub fn dispatch(app: &AppHandle, name: &str, args: &Value) -> Result<Value, String> {
    let state = app
        .try_state::<AppState>()
        .ok_or_else(|| "应用尚未初始化".to_string())?;
    match name {
        "vault_info" => {
            let info = state
                .with_vault(|v| {
                    let (count, bytes) = images_db::stats(&v.conn)?;
                    Ok(json!({"root": v.root.to_string_lossy(), "images": count, "bytes": bytes}))
                })
                .map_err(|e| e.message)?;
            Ok(info)
        }
        "list_images" => list_images(&state, args),
        "get_image" => {
            let id = args["id"].as_i64().ok_or("缺少 id")?;
            let list = state
                .with_vault(|v| images_db::list(&v.conn))
                .map_err(|e| e.message)?;
            list.into_iter()
                .find(|i| i.id == id)
                .map(|i| serde_json::to_value(i).unwrap_or(Value::Null))
                .ok_or_else(|| "图片不存在".to_string())
        }
        "import_images" => import_images(&state, args),
        "rename_image" => {
            let id = args["id"].as_i64().ok_or("缺少 id")?;
            let name = args["newName"].as_str().ok_or("缺少 newName")?;
            let img = manage_core::rename_image(&state, id, name).map_err(|e| e.message)?;
            Ok(serde_json::to_value(img).unwrap_or(Value::Null))
        }
        "delete_images" => {
            let ids = ids_arg(args)?;
            let out = manage_core::delete_images(&state, &ids).map_err(|e| e.message)?;
            Ok(serde_json::to_value(out).unwrap_or(Value::Null))
        }
        "export_images" => {
            let ids = ids_arg(args)?;
            let target = args["targetDir"].as_str().ok_or("缺少 targetDir")?;
            let mode = args["mode"].as_str().unwrap_or("copy");
            let out = manage_core::export_images(&state, &ids, target, mode)
                .map_err(|e| e.message)?;
            Ok(serde_json::to_value(out).unwrap_or(Value::Null))
        }
        "list_categories" => {
            let list = state
                .with_vault(|v| categories_db::list(&v.conn))
                .map_err(|e| e.message)?;
            Ok(serde_json::to_value(list).unwrap_or(Value::Null))
        }
        "create_category" => {
            let name = args["name"].as_str().ok_or("缺少 name")?;
            let item = state
                .with_vault(|v| categories_db::create(&v.conn, name))
                .map_err(|e| e.message)?;
            Ok(serde_json::to_value(item).unwrap_or(Value::Null))
        }
        "rename_category" => {
            let id = args["id"].as_i64().ok_or("缺少 id")?;
            let name = args["name"].as_str().ok_or("缺少 name")?;
            state
                .with_vault(|v| categories_db::rename(&v.conn, id, name))
                .map_err(|e| e.message)?;
            Ok(json!({"ok": true}))
        }
        "delete_category" => {
            let id = args["id"].as_i64().ok_or("缺少 id")?;
            state
                .with_vault(|v| categories_db::delete(&v.conn, id))
                .map_err(|e| e.message)?;
            Ok(json!({"ok": true}))
        }
        "assign_category" => {
            let ids = ids_arg_key(args, "imageIds")?;
            let category_id = args["categoryId"].as_i64().ok_or("缺少 categoryId")?;
            let assign = args["assign"].as_bool().unwrap_or(true);
            state
                .with_vault(|v| {
                    if assign {
                        categories_db::assign(&v.conn, &ids, category_id)
                    } else {
                        categories_db::unassign(&v.conn, &ids, category_id)
                    }
                })
                .map_err(|e| e.message)?;
            Ok(json!({"ok": true}))
        }
        "list_tags" => {
            let list = state
                .with_vault(|v| tags_db::list(&v.conn))
                .map_err(|e| e.message)?;
            Ok(serde_json::to_value(list).unwrap_or(Value::Null))
        }
        "create_tag" => {
            let name = args["name"].as_str().ok_or("缺少 name")?;
            let item = state
                .with_vault(|v| tags_db::create(&v.conn, name))
                .map_err(|e| e.message)?;
            Ok(serde_json::to_value(item).unwrap_or(Value::Null))
        }
        "assign_tag" => {
            let ids = ids_arg_key(args, "imageIds")?;
            let tag_id = args["tagId"].as_i64().ok_or("缺少 tagId")?;
            let assign = args["assign"].as_bool().unwrap_or(true);
            state
                .with_vault(|v| {
                    if assign {
                        tags_db::assign(&v.conn, &ids, tag_id)
                    } else {
                        tags_db::unassign(&v.conn, &ids, tag_id)
                    }
                })
                .map_err(|e| e.message)?;
            Ok(json!({"ok": true}))
        }
        "get_settings" => Ok(serde_json::to_value(state.settings_snapshot()).unwrap_or(Value::Null)),
        "update_settings" => {
            let patch: SettingsPatch = serde_json::from_value(args["patch"].clone())
                .map_err(|e| format!("参数不合法：{e}"))?;
            let mut current = state.settings_snapshot();
            current.apply(&patch);
            state
                .with_vault(|v| settings_db::save(&v.conn, &current))
                .map_err(|e| e.message)?;
            if let Ok(mut guard) = state.settings.lock() {
                *guard = current.clone();
            }
            Ok(serde_json::to_value(current).unwrap_or(Value::Null))
        }
        "scan_library" => {
            let report = scan_core::scan(&state).map_err(|e| e.message)?;
            Ok(serde_json::to_value(report).unwrap_or(Value::Null))
        }
        "plugins_list" => Ok(serde_json::to_value(crate::plugins::list().unwrap_or_default())
            .unwrap_or(Value::Null)),
        "plugin_set_enabled" => {
            let id = args["id"].as_str().ok_or("缺少 id")?;
            let enabled = args["enabled"].as_bool().unwrap_or(false);
            crate::plugins::set_enabled(id, enabled).map_err(|e| e.to_string())?;
            Ok(json!({"ok": true}))
        }
        other => Err(format!("未知工具：{other}")),
    }
}

fn ids_arg(args: &Value) -> Result<Vec<i64>, String> {
    ids_arg_key(args, "ids")
}

fn ids_arg_key(args: &Value, key: &str) -> Result<Vec<i64>, String> {
    args[key]
        .as_array()
        .ok_or_else(|| format!("缺少 {key}"))?
        .iter()
        .map(|v| v.as_i64().ok_or_else(|| format!("{key} 中含有非数字")))
        .collect()
}

fn list_images(state: &AppState, args: &Value) -> Result<Value, String> {
    let category = args["categoryId"].as_i64();
    let tag = args["tagId"].as_i64();
    let query = args["query"].as_str().unwrap_or("").to_lowercase();
    let missing_only = args["missingOnly"].as_bool().unwrap_or(false);
    let limit = args["limit"].as_i64().unwrap_or(200).clamp(1, 2000) as usize;
    let offset = args["offset"].as_i64().unwrap_or(0).max(0) as usize;

    let list = state
        .with_vault(|v| images_db::list(&v.conn))
        .map_err(|e| e.message)?;
    let mut filtered: Vec<_> = list
        .into_iter()
        .filter(|image| {
            if missing_only && !image.missing {
                return false;
            }
            if let Some(cat) = category {
                if cat == 0 {
                    if !image.categories.is_empty() {
                        return false;
                    }
                } else if !image.categories.contains(&cat) {
                    return false;
                }
            }
            if let Some(tag_id) = tag {
                if !image.tags.contains(&tag_id) {
                    return false;
                }
            }
            if !query.is_empty() && !image.file_name.to_lowercase().contains(&query) {
                return false;
            }
            true
        })
        .collect();
    let total = filtered.len();
    filtered = filtered.into_iter().skip(offset).take(limit).collect();
    Ok(json!({
        "total": total,
        "items": serde_json::to_value(filtered).unwrap_or(Value::Null)
    }))
}

fn import_images(state: &AppState, args: &Value) -> Result<Value, String> {
    let paths: Vec<String> = args["paths"]
        .as_array()
        .ok_or("缺少 paths")?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    let names = args["names"].as_object().cloned().unwrap_or_default();
    let category_id = args["categoryId"].as_i64();
    let tag_id = args["tagId"].as_i64();
    let mode = args["mode"].as_str().unwrap_or("move").to_string();

    let mut results = Vec::new();
    for path in paths {
        let fallback = std::path::Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "未命名".to_string());
        let name = names
            .get(&path)
            .and_then(|v| v.as_str())
            .unwrap_or(&fallback)
            .to_string();
        match import_core::import_one(state, &path, &name, &mode) {
            Ok(outcome) => {
                let id = outcome.image.id;
                if let Some(cat) = category_id {
                    let _ = state.with_vault(|v| categories_db::assign(&v.conn, &[id], cat));
                }
                if let Some(tag) = tag_id {
                    let _ = state.with_vault(|v| tags_db::assign(&v.conn, &[id], tag));
                }
                results.push(json!({
                    "path": path,
                    "ok": true,
                    "file": outcome.final_name,
                    "id": id
                }));
            }
            Err(err) => results.push(json!({"path": path, "ok": false, "error": err.message})),
        }
    }
    Ok(json!(results))
}
