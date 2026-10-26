//! 扩展名、MIME、图片尺寸读取。

use std::fs;
use std::path::Path;

pub fn ext_of(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    if ext == "jpeg" {
        Some("jpg".to_string())
    } else {
        Some(ext)
    }
}

pub fn is_supported(ext: &str) -> bool {
    matches!(ext, "jpg" | "png" | "gif" | "webp" | "bmp" | "svg" | "avif")
}

pub fn mime_of(ext: &str) -> &'static str {
    match ext {
        "jpg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

/// 读取图片原始宽高。失败（损坏 / 不支持）返回 (None, None)，不阻断裂入库。
pub fn read_dimensions(path: &Path, ext: &str) -> (Option<u32>, Option<u32>) {
    if ext == "svg" {
        if let Ok(bytes) = fs::read(path) {
            if let Ok(tree) = resvg::usvg::Tree::from_data(&bytes, &resvg::usvg::Options::default())
            {
                let size = tree.size();
                return (
                    Some(size.width().round().max(1.0) as u32),
                    Some(size.height().round().max(1.0) as u32),
                );
            }
        }
        return (None, None);
    }
    if ext == "avif" {
        // AVIF 尺寸在生成缩略图时补齐（解析容器成本高于收益）。
        return (None, None);
    }
    let reader = image::ImageReader::open(path)
        .ok()
        .and_then(|r| r.with_guessed_format().ok());
    match reader {
        Some(reader) => match reader.into_dimensions() {
            Ok((w, h)) => (Some(w), Some(h)),
            Err(_) => (None, None),
        },
        None => (None, None),
    }
}

/// 文件大小与修改时间（Unix 秒）。
pub fn file_facts(path: &Path) -> Option<(i64, i64)> {
    let meta = fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    Some((meta.len() as i64, mtime))
}
