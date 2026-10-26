//! 文件系统工具：长路径、空间检查、原子复制/移动。

use crate::error::{AppError, AppResult};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

/// 把数据库里的相对路径（统一用 `/`）还原成绝对路径。
pub fn abs_path(root: &Path, rel: &str) -> PathBuf {
    let rel = rel.replace('/', std::path::MAIN_SEPARATOR_STR);
    fs_path(&root.join(rel))
}

/// 计算相对路径（统一 `/`），失败返回 None。
pub fn rel_path_of(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let mut parts: Vec<String> = Vec::new();
    for c in rel.components() {
        match c {
            Component::Normal(s) => parts.push(s.to_string_lossy().to_string()),
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

/// 超过 240 字符时加 `\\?\` 前缀，规避 MAX_PATH 限制。
pub fn fs_path(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if path.is_absolute() && s.chars().count() >= 240 && !s.starts_with(r"\\?\") {
        PathBuf::from(format!(r"\\?\{}", s))
    } else {
        path.to_path_buf()
    }
}

/// 目标目录剩余空间（字节）。
pub fn available_space(dir: &Path) -> u64 {
    fs2::available_space(dir).unwrap_or(u64::MAX)
}

/// 写入前检查空间：需求 + 32MB 余量。
pub fn ensure_space(dir: &Path, need: u64) -> AppResult<()> {
    let free = available_space(dir);
    if free != u64::MAX && free < need.saturating_add(32 * 1024 * 1024) {
        return Err(AppError::new(
            "DISK_FULL",
            format!(
                "磁盘空间不足：剩余 {}，本次需要 {}",
                human_size(free),
                human_size(need)
            ),
        ));
    }
    Ok(())
}

pub fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut idx = 0;
    while value >= 1024.0 && idx < UNITS.len() - 1 {
        value /= 1024.0;
        idx += 1;
    }
    if idx == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", UNITS[idx])
    }
}

fn temp_sibling(dst: &Path) -> PathBuf {
    let name = dst
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    dst.with_file_name(format!(".{name}.{stamp}.part"))
}

/// 复制到临时文件 → fsync → 改名，保证不产生半截文件。
pub fn copy_atomic(src: &Path, dst: &Path) -> AppResult<()> {
    let tmp = temp_sibling(dst);
    let result = (|| -> io::Result<()> {
        let mut reader = File::open(fs_path(src))?;
        let mut writer = File::create(fs_path(&tmp))?;
        io::copy(&mut reader, &mut writer)?;
        writer.flush()?;
        writer.sync_all()?;
        drop(writer);
        fs::rename(fs_path(&tmp), fs_path(dst))?;
        Ok(())
    })();
    match result {
        Ok(()) => Ok(()),
        Err(err) => {
            let _ = fs::remove_file(fs_path(&tmp));
            Err(AppError::io("复制文件失败", err))
        }
    }
}

/// 按设置执行移动或复制。同盘移动优先用 rename（瞬时、无额外空间）。
pub fn move_or_copy(src: &Path, dst: &Path, mode: &str) -> AppResult<()> {
    if mode == "copy" {
        let size = fs::metadata(fs_path(src))
            .map_err(|e| AppError::io("读取源文件信息失败", e))?
            .len();
        let parent = dst.parent().unwrap_or(dst);
        ensure_space(parent, size)?;
        return copy_atomic(src, dst);
    }

    match fs::rename(fs_path(src), fs_path(dst)) {
        Ok(()) => Ok(()),
        Err(err) if err.raw_os_error() == Some(17) => {
            // 跨盘：先复制再删源，失败时不留半成品
            let size = fs::metadata(fs_path(src))
                .map_err(|e| AppError::io("读取源文件信息失败", e))?
                .len();
            let parent = dst.parent().unwrap_or(dst);
            ensure_space(parent, size)?;
            copy_atomic(src, dst)?;
            fs::remove_file(fs_path(src))
                .map_err(|e| AppError::io("文件已复制，但删除原文件失败", e))?;
            Ok(())
        }
        Err(err) => Err(AppError::io("移动文件失败", err)),
    }
}

pub fn remove_file_quietly(path: &Path) {
    let _ = fs::remove_file(fs_path(path));
}

/// 判断 child 是否位于 parent 内（用于"拖回图库目录"检测）。
pub fn is_inside(parent: &Path, child: &Path) -> bool {
    let p = fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
    let c = match fs::canonicalize(child) {
        Ok(v) => v,
        Err(_) => return false,
    };
    c.starts_with(&p)
}
