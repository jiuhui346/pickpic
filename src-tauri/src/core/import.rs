//! 导入流水线：探测拖入内容 → 清洗命名 → 查重 → 原子落盘 → 入库。

use crate::core::{fsutil, meta, naming};
use crate::db::images as images_db;
use crate::error::{AppError, AppResult};
use crate::models::{DirCandidate, ImageMeta, ImportOutcome, ProbeResult, RejectedFile};
use crate::state::AppState;
use chrono::Local;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub const FOLDER_LIMIT: usize = 2000;

/// 把拖入的路径分成：可导入图片 / 文件夹 / 被拒绝项。
pub fn probe(paths: &[String]) -> ProbeResult {
    let mut images = Vec::new();
    let mut dirs = Vec::new();
    let mut rejected = Vec::new();

    for raw in paths {
        let path = PathBuf::from(raw);
        if path.is_dir() {
            let found = scan_folder(&path);
            dirs.push(DirCandidate {
                path: raw.clone(),
                image_count: found.len(),
            });
        } else if path.is_file() {
            match meta::ext_of(&path) {
                Some(ext) if meta::is_supported(&ext) => images.push(raw.clone()),
                Some(ext) => rejected.push(RejectedFile {
                    path: raw.clone(),
                    reason: format!("不是支持的图片格式（.{ext}）"),
                }),
                None => rejected.push(RejectedFile {
                    path: raw.clone(),
                    reason: "无法识别文件类型（没有扩展名）".to_string(),
                }),
            }
        } else {
            rejected.push(RejectedFile {
                path: raw.clone(),
                reason: "文件不存在或无法访问".to_string(),
            });
        }
    }

    ProbeResult {
        images,
        dirs,
        rejected,
    }
}

/// 递归收集文件夹内的图片（只取支持的图片格式，最多 FOLDER_LIMIT 张）。
pub fn scan_folder(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    for entry in WalkDir::new(fsutil::fs_path(dir))
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if out.len() >= FOLDER_LIMIT {
            break;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if let Some(ext) = meta::ext_of(path) {
            if meta::is_supported(&ext) {
                out.push(path.to_string_lossy().to_string());
            }
        }
    }
    out
}

/// 导入单张图片。前端逐个调用，天然形成队列。
pub fn import_one(
    state: &AppState,
    source: &str,
    requested_name: &str,
    mode: &str,
) -> AppResult<ImportOutcome> {
    // 串行化：命名查重与落盘必须互斥
    let _gate = state
        .import_gate
        .lock()
        .map_err(|_| AppError::internal("导入锁异常，请重启软件"))?;

    let src = PathBuf::from(source);
    if !src.is_file() {
        return Err(AppError::new(
            "SOURCE_MISSING",
            format!("找不到源文件：{}", src.display()),
        ));
    }
    let ext = meta::ext_of(&src)
        .ok_or_else(|| AppError::new("UNSUPPORTED", "无法识别文件类型"))?;
    if !meta::is_supported(&ext) {
        return Err(AppError::new(
            "UNSUPPORTED",
            format!("不支持的图片格式：.{ext}"),
        ));
    }

    let root = state.root()?;
    if fsutil::is_inside(&root, &src) {
        return Err(AppError::new("ALREADY_IN_VAULT", "该文件已经在图库目录中"));
    }

    let (size, mtime) = meta::file_facts(&src)
        .ok_or_else(|| AppError::new("SOURCE_MISSING", "无法读取源文件信息"))?;
    let content_hash = crate::core::hash::file_hash(&src).ok();

    let now = Local::now();
    let rel_dir = format!("images/{}/{}", now.format("%Y"), now.format("%m"));
    let dir = fsutil::abs_path(&root, &rel_dir);
    fs::create_dir_all(fsutil::fs_path(&dir))
        .map_err(|e| AppError::io("创建图片目录失败", e))?;

    let fallback = src
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名".to_string());
    let (base, mut warnings) = naming::sanitize_base(requested_name, &fallback);

    // 给文件名留出的字符预算：全路径 ≤ 240
    let root_len = root.to_string_lossy().chars().count();
    let budget = 240usize
        .saturating_sub(root_len + rel_dir.chars().count() + ext.chars().count() + 4)
        .clamp(24, 100);
    let (base, truncated) = naming::truncate_base(&base, budget);
    if truncated {
        warnings.push(format!("名称过长，已截断为 {budget} 个字符以内"));
    }

    let (file_name, renamed) = state.with_vault(|v| {
        unique_name(&dir, &rel_dir, &base, &ext, &v.conn)
    })?;
    if renamed {
        warnings.push(format!("存在同名文件，已自动命名为「{file_name}」"));
    }

    let target = dir.join(&file_name);
    let import_mode = if mode == "copy" { "copy" } else { "move" };
    fsutil::move_or_copy(&src, &target, import_mode)?;

    let (width, height) = meta::read_dimensions(&target, &ext);
    let imported_at = Local::now().timestamp();
    let rel_path = format!("{rel_dir}/{file_name}");

    let inserted = state.with_vault(|v| {
        images_db::insert(
            &v.conn,
            &images_db::NewImage {
                rel_path: &rel_path,
                file_name: &file_name,
                base_name: &base,
                ext: &ext,
                mime: meta::mime_of(&ext),
                size_bytes: size,
                width,
                height,
                file_mtime: mtime,
                imported_at,
                content_hash: content_hash.as_deref(),
            },
        )
    });

    let id = match inserted {
        Ok(id) => id,
        Err(err) => {
            // 入库失败 → 回滚文件，避免"幽灵文件"
            if import_mode == "move" {
                let _ = fs::rename(fsutil::fs_path(&target), fsutil::fs_path(&src));
            } else {
                fsutil::remove_file_quietly(&target);
            }
            return Err(err);
        }
    };

    Ok(ImportOutcome {
        image: ImageMeta {
            id,
            rel_path: rel_path.clone(),
            file_name: file_name.clone(),
            base_name: base.clone(),
            ext: ext.clone(),
            size_bytes: size,
            width,
            height,
            mtime,
            imported_at,
            thumb_state: 0,
            missing: false,
            categories: Vec::new(),
            tags: Vec::new(),
        },
        final_name: file_name,
        warnings,
    })
}

/// 生成不冲突的文件名：`名称.jpg` → `名称_1.jpg` …
fn unique_name(
    dir: &Path,
    rel_dir: &str,
    base: &str,
    ext: &str,
    conn: &Connection,
) -> AppResult<(String, bool)> {
    for index in 0..9999 {
        let candidate = if index == 0 {
            format!("{base}.{ext}")
        } else {
            format!("{base}_{index}.{ext}")
        };
        let rel = format!("{rel_dir}/{candidate}");
        let on_disk = dir.join(&candidate).exists();
        if !on_disk && !images_db::exists_rel(conn, &rel)? {
            return Ok((candidate, index > 0));
        }
    }
    Err(AppError::new("NAME_EXHAUSTED", "同名文件过多，请换一个名称"))
}
