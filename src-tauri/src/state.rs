//! 应用运行状态：当前图库（根目录 + SQLite 连接）、设置缓存、缩略图并发闸门。

use crate::error::{AppError, AppResult};
use crate::models::Settings;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct Vault {
    pub root: PathBuf,
    pub conn: Connection,
}

pub struct AppState {
    pub app: AppHandle,
    pub vault: Mutex<Option<Vault>>,
    pub settings: Mutex<Settings>,
    /// 缩略图生成最多 4 个并发，避免一次性解码几十张大图。
    pub thumb_sem: tokio::sync::Semaphore,
    /// 导入串行执行：命名查重与落盘必须互斥。
    pub import_gate: Mutex<()>,
    /// 拖出前对 images/ 的文件快照，用于检测「拖回图库目录」。
    pub drag_guard: Mutex<Option<std::collections::HashSet<String>>>,
    /// 本地 MCP 服务句柄
    pub mcp: Mutex<Option<crate::mcp::server::McpServer>>,
}

impl AppState {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            vault: Mutex::new(None),
            settings: Mutex::new(Settings::default()),
            thumb_sem: tokio::sync::Semaphore::new(4),
            import_gate: Mutex::new(()),
            drag_guard: Mutex::new(None),
            mcp: Mutex::new(None),
        }
    }

    pub fn root(&self) -> AppResult<PathBuf> {
        self.with_vault(|v| Ok(v.root.clone()))
    }

    /// 在持有锁的情况下访问图库；闭包内不要做耗时 IO（会阻塞其它命令）。
    pub fn with_vault<T>(&self, f: impl FnOnce(&Vault) -> AppResult<T>) -> AppResult<T> {
        let guard = self
            .vault
            .lock()
            .map_err(|_| AppError::internal("应用状态异常，请重启软件"))?;
        let vault = guard
            .as_ref()
            .ok_or_else(|| AppError::new("NO_VAULT", "尚未设置图库目录"))?;
        f(vault)
    }

    pub fn settings_snapshot(&self) -> Settings {
        self.settings
            .lock()
            .map(|s| s.clone())
            .unwrap_or_default()
    }

    /// 把存储根加入 asset 协议白名单（只放行当前图库）。
    pub fn allow_asset_dir(&self, root: &Path) {
        let _ = self.app.asset_protocol_scope().allow_directory(root, true);
    }
}
