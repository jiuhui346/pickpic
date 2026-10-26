//! 图库目录相关命令：启动探测、初始化/切换、迁移、信息查询。

use crate::core::fsutil;
use crate::db;
use crate::db::images as images_db;
use crate::db::settings as settings_db;
use crate::error::{AppError, AppResult};
use crate::models::{MigrateProgress, VaultInfo, VaultStatus};
use crate::state::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
use winreg::RegKey;

const REG_SUBKEY: &str = "Software\\ImageVault";
const REG_VALUE: &str = "StorageRoot";
const MIN_FREE: u64 = 100 * 1024 * 1024;

/// 折叠重复的路径分隔符（保留 UNC 开头的 `\\`），统一成反斜杠。
fn normalize_separators(input: &str) -> String {
    let unc = input.starts_with("\\\\");
    let mut out = String::new();
    let mut prev_sep = false;
    for ch in input.chars() {
        if ch == '\\' || ch == '/' {
            if prev_sep {
                continue;
            }
            prev_sep = true;
            out.push('\\');
        } else {
            prev_sep = false;
            out.push(ch);
        }
    }
    if unc && !out.starts_with("\\\\") {
        out.insert(0, '\\');
    }
    out
}

fn read_registered_root() -> Option<String> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(REG_SUBKEY, KEY_READ)
        .ok()?;
    key.get_value::<String, _>(REG_VALUE).ok()
}

fn write_registered_root(path: &str) -> AppResult<()> {
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(REG_SUBKEY)
        .map_err(|e| AppError::new("REGISTRY", format!("无法保存存储目录设置：{e}")))?;
    key.set_value(REG_VALUE, &path.to_string())
        .map_err(|e| AppError::new("REGISTRY", format!("无法保存存储目录设置：{e}")))?;
    Ok(())
}

/// 校验一个候选目录：存在或可创建、可写、空间足够。
fn prepare_root(path: &str) -> AppResult<PathBuf> {
    let raw = path.trim();
    if raw.is_empty() {
        return Err(AppError::new("INVALID_PATH", "请输入存储目录路径"));
    }
    let p = PathBuf::from(normalize_separators(raw));
    if !p.is_absolute() {
        return Err(AppError::new(
            "INVALID_PATH",
            "请填写绝对路径，例如 D:\\ImageVault",
        ));
    }
    if p.is_file() {
        return Err(AppError::new(
            "INVALID_PATH",
            "该路径是一个文件，请选择文件夹",
        ));
    }
    fs::create_dir_all(fsutil::fs_path(&p)).map_err(|e| AppError::io("无法创建存储目录", e))?;
    let probe = p.join(".image-vault-write-test");
    fs::write(fsutil::fs_path(&probe), b"ok").map_err(|e| AppError::io("存储目录不可写", e))?;
    let _ = fs::remove_file(fsutil::fs_path(&probe));

    let free = fsutil::available_space(&p);
    if free < MIN_FREE {
        return Err(AppError::new(
            "DISK_FULL",
            format!(
                "该磁盘剩余空间不足（{}），至少需要 100 MB",
                fsutil::human_size(free)
            ),
        ));
    }
    Ok(p)
}

fn open_vault(state: &AppState, root: &Path) -> AppResult<VaultInfo> {
    let (conn, recovered) = db::open(root)?;
    let _ = fs::create_dir_all(root.join("thumbs"));
    let _ = fs::create_dir_all(root.join("images"));
    let settings = settings_db::load(&conn);
    let (count, bytes) = images_db::stats(&conn)?;

    state.allow_asset_dir(root);
    let mut guard = state
        .vault
        .lock()
        .map_err(|_| AppError::internal("应用状态异常"))?;
    *guard = Some(crate::state::Vault {
        root: root.to_path_buf(),
        conn,
    });
    if let Ok(mut s) = state.settings.lock() {
        *s = settings.clone();
    }
    let _ = crate::mcp::apply(&state.app, &settings);
    Ok(VaultInfo {
        root: root.to_string_lossy().to_string(),
        image_count: count,
        total_bytes: bytes,
        recovered_backup: recovered,
    })
}

fn current_info(state: &AppState) -> AppResult<VaultInfo> {
    state.with_vault(|v| {
        let (count, bytes) = images_db::stats(&v.conn)?;
        Ok(VaultInfo {
            root: v.root.to_string_lossy().to_string(),
            image_count: count,
            total_bytes: bytes,
            recovered_backup: None,
        })
    })
}

/// 启动时调用：读注册表 → 尝试打开图库 → 返回状态。
#[tauri::command]
pub async fn vault_boot(state: State<'_, AppState>) -> AppResult<VaultStatus> {
    if let Ok(info) = current_info(&state) {
        return Ok(VaultStatus {
            configured: true,
            ready: true,
            root: Some(info.root),
            error: None,
            recovered_backup: None,
        });
    }
    let Some(root) = read_registered_root() else {
        return Ok(VaultStatus {
            configured: false,
            ready: false,
            root: None,
            error: None,
            recovered_backup: None,
        });
    };
    let path = PathBuf::from(normalize_separators(&root));
    if !path.is_dir() {
        return Ok(VaultStatus {
            configured: true,
            ready: false,
            root: Some(root.clone()),
            error: Some("存储目录不存在（可能被移动或删除了），请重新指定".to_string()),
            recovered_backup: None,
        });
    }
    match open_vault(&state, &path) {
        Ok(info) => Ok(VaultStatus {
            configured: true,
            ready: true,
            root: Some(info.root.clone()),
            error: None,
            recovered_backup: info.recovered_backup,
        }),
        Err(err) => Ok(VaultStatus {
            configured: true,
            ready: false,
            root: Some(root),
            error: Some(err.message),
            recovered_backup: None,
        }),
    }
}

/// 首次初始化 / 重新指定存储目录。
#[tauri::command]
pub async fn vault_choose(state: State<'_, AppState>, path: String) -> AppResult<VaultInfo> {
    let root = prepare_root(&path)?;
    let info = open_vault(&state, &root)?;
    write_registered_root(&info.root)?;
    Ok(info)
}

#[tauri::command]
pub async fn vault_info(state: State<'_, AppState>) -> AppResult<VaultInfo> {
    current_info(&state)
}

/// 迁移图库到新目录：复制全部文件 → 校验 → 切换；旧目录保留。
#[tauri::command]
pub async fn vault_migrate(
    state: State<'_, AppState>,
    app: AppHandle,
    new_path: String,
) -> AppResult<VaultInfo> {
    let old_root = state.root()?;
    let new_root = prepare_root(&new_path)?;

    let old_c = fs::canonicalize(&old_root).unwrap_or(old_root.clone());
    let new_c = fs::canonicalize(&new_root).unwrap_or(new_root.clone());
    if old_c == new_c {
        return Err(AppError::new("SAME_PATH", "新目录与当前目录相同"));
    }
    if new_c.starts_with(&old_c) || old_c.starts_with(&new_c) {
        return Err(AppError::new(
            "NESTED_PATH",
            "新目录不能是当前目录的子目录，也不能包含当前目录",
        ));
    }

    let mut files: Vec<(PathBuf, String, u64)> = Vec::new();
    collect_files(&old_root, &old_root, &mut files)?;
    let total: u64 = files.iter().map(|f| f.2).sum();
    let free = fsutil::available_space(&new_root);
    if free < total + 50 * 1024 * 1024 {
        return Err(AppError::new(
            "DISK_FULL",
            format!(
                "新目录所在磁盘空间不足：需要约 {}，剩余 {}",
                fsutil::human_size(total),
                fsutil::human_size(free)
            ),
        ));
    }

    // 取出连接并 checkpoint，确保 vault.db 是完整的
    {
        let mut guard = state
            .vault
            .lock()
            .map_err(|_| AppError::internal("应用状态异常"))?;
        if let Some(v) = guard.as_ref() {
            db::checkpoint(&v.conn);
        }
        *guard = None;
    }

    let mut copied: Vec<PathBuf> = Vec::new();
    let copy_result = (|| -> AppResult<()> {
        let count = files.len();
        for (index, (src, rel, _size)) in files.iter().enumerate() {
            let dst = new_root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(parent) = dst.parent() {
                fs::create_dir_all(fsutil::fs_path(parent))
                    .map_err(|e| AppError::io("创建目标目录失败", e))?;
            }
            fs::copy(fsutil::fs_path(src), fsutil::fs_path(&dst))
                .map_err(|e| AppError::io("迁移文件失败", e))?;
            copied.push(dst.clone());
            let _ = app.emit(
                "vault-migrate-progress",
                MigrateProgress {
                    done: index + 1,
                    total: count,
                    current: rel.clone(),
                },
            );
        }
        Ok(())
    })();

    if let Err(err) = copy_result {
        for f in copied.iter().rev() {
            fsutil::remove_file_quietly(f);
        }
        let _ = open_vault(&state, &old_root);
        return Err(err);
    }

    match open_vault(&state, &new_root) {
        Ok(info) => {
            write_registered_root(&info.root)?;
            Ok(info)
        }
        Err(err) => {
            let _ = open_vault(&state, &old_root);
            Err(AppError::new(
                "MIGRATE_FAILED",
                format!(
                    "新目录中的数据库校验失败，已继续使用旧目录：{}",
                    err.message
                ),
            ))
        }
    }
}

/// 首次启动时建议的默认存储目录：`<用户目录>\Pictures\ImageVault`。
#[tauri::command]
pub async fn suggested_vault_path() -> AppResult<String> {
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string());
    Ok(format!("{home}\\Pictures\\ImageVault"))
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<(PathBuf, String, u64)>) -> AppResult<()> {
    for entry in fs::read_dir(fsutil::fs_path(dir)).map_err(|e| AppError::io("读取目录失败", e))? {
        let entry = entry.map_err(|e| AppError::io("读取目录失败", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with("-wal") || name.ends_with("-shm") || name.ends_with(".part") {
            continue;
        }
        if path.is_dir() {
            collect_files(root, &path, out)?;
        } else if path.is_file() {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            if let Some(rel) = fsutil::rel_path_of(root, &path) {
                out.push((path.clone(), rel, size));
            }
        }
    }
    Ok(())
}

/// 当前可执行文件路径（用于生成 MCP stdio 配置）。
#[tauri::command]
pub async fn app_exe_path() -> AppResult<String> {
    let path = std::env::current_exe().map_err(|e| AppError::io("无法获取程序路径", e))?;
    Ok(path.to_string_lossy().to_string())
}