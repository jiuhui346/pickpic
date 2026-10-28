//! 缩略图生成：最长边 512px；带透明的存 PNG，其余存 JPEG(q85)。

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use crate::core::fsutil::fs_path;
use crate::error::{AppError, AppResult};
use image::{DynamicImage, RgbaImage};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

pub struct ThumbOutput {
    /// 相对存储根的路径，如 `thumbs/12.jpg`
    pub rel_path: String,
    pub width: u32,
    pub height: u32,
}

const MAX_EDGE: u32 = 512;

/// 生成缩略图。`dest_stem` 形如 `<root>/thumbs/12`，最终扩展名由是否含透明决定。
pub fn generate(source: &Path, ext: &str, dest_stem: &Path) -> AppResult<ThumbOutput> {
    let decoded = decode(source, ext)?;
    // SVG 渲染时已缩到 512，原始尺寸要从 viewBox 重新读
    let (original_w, original_h) = if ext == "svg" {
        let (w, h) = crate::core::meta::read_dimensions(source, "svg");
        (w.unwrap_or(decoded.width()), h.unwrap_or(decoded.height()))
    } else {
        (decoded.width(), decoded.height())
    };

    let resized = if original_w.max(original_h) > MAX_EDGE {
        let scale = MAX_EDGE as f32 / original_w.max(original_h) as f32;
        let nw = ((original_w as f32 * scale).round() as u32).max(1);
        let nh = ((original_h as f32 * scale).round() as u32).max(1);
        decoded.resize_exact(nw, nh, image::imageops::FilterType::Lanczos3)
    } else {
        decoded
    };

    let has_alpha = resized.color().has_alpha() && {
        let rgba = resized.to_rgba8();
        rgba.pixels().any(|p| p.0[3] < 255)
    };

    let (tmp, final_path, rel) = if has_alpha {
        (
            with_ext(dest_stem, "tmp.png"),
            with_ext(dest_stem, "png"),
            format!("thumbs/{}.png", stem_name(dest_stem)),
        )
    } else {
        (
            with_ext(dest_stem, "tmp.jpg"),
            with_ext(dest_stem, "jpg"),
            format!("thumbs/{}.jpg", stem_name(dest_stem)),
        )
    };

    let write_result: AppResult<()> = (|| {
        let mut file = fs::File::create(fs_path(&tmp))
            .map_err(|e| AppError::io("创建缩略图文件失败", e))?;
        if has_alpha {
            let rgba = resized.to_rgba8();
            let mut buf = Cursor::new(Vec::new());
            DynamicImage::ImageRgba8(rgba)
                .write_to(&mut buf, image::ImageFormat::Png)
                .map_err(|e| AppError::new("THUMB", format!("缩略图编码失败：{e}")))?;
            std::io::copy(&mut Cursor::new(buf.into_inner()), &mut file)
                .map_err(|e| AppError::io("写入缩略图失败", e))?;
        } else {
            let rgb = resized.to_rgb8();
            let mut encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, 85);
            encoder
                .encode_image(&rgb)
                .map_err(|e| AppError::new("THUMB", format!("缩略图编码失败：{e}")))?;
        }
        file.sync_all()
            .map_err(|e| AppError::io("写入缩略图失败", e))?;
        drop(file);
        fs::rename(fs_path(&tmp), fs_path(&final_path))
            .map_err(|e| AppError::io("保存缩略图失败", e))?;
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(fs_path(&tmp));
    }
    write_result?;

    Ok(ThumbOutput {
        rel_path: rel,
        width: original_w,
        height: original_h,
    })
}

fn stem_name(stem: &Path) -> String {
    stem.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "thumb".to_string())
}

fn with_ext(stem: &Path, ext: &str) -> PathBuf {
    let mut p = stem.to_path_buf();
    p.set_extension(ext);
    p
}

fn decode(path: &Path, ext: &str) -> AppResult<DynamicImage> {
    match ext {
        "svg" => decode_svg(path),
        "avif" => decode_avif(path),
        _ => {
            let mut reader = image::ImageReader::open(fs_path(path))
                .map_err(|e| AppError::io("打开图片失败", e))?
                .with_guessed_format()
                .map_err(|e| AppError::io("识别图片格式失败", e))?;
            let mut limits = image::Limits::default();
            limits.max_alloc = Some(512 * 1024 * 1024);
            reader.limits(limits);
            reader
                .decode()
                .map_err(|e| AppError::new("DECODE", format!("图片解码失败：{e}")))
        }
    }
}

fn decode_svg(path: &Path) -> AppResult<DynamicImage> {
    let bytes = fs::read(fs_path(path)).map_err(|e| AppError::io("读取 SVG 失败", e))?;
    let tree = resvg::usvg::Tree::from_data(&bytes, &resvg::usvg::Options::default())
        .map_err(|e| AppError::new("DECODE", format!("SVG 解析失败：{e}")))?;
    let size = tree.size();
    let scale = (MAX_EDGE as f32 / size.width().max(size.height())).min(1.0);
    let w = (size.width() * scale).round().max(1.0) as u32;
    let h = (size.height() * scale).round().max(1.0) as u32;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(w, h)
        .ok_or_else(|| AppError::new("DECODE", "SVG 尺寸无效"))?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    let img = RgbaImage::from_raw(w, h, pixmap.data().to_vec())
        .ok_or_else(|| AppError::new("DECODE", "SVG 渲染失败"))?;
    Ok(DynamicImage::ImageRgba8(img))
}

fn decode_avif(path: &Path) -> AppResult<DynamicImage> {
    let bytes = fs::read(fs_path(path)).map_err(|e| AppError::io("读取 AVIF 失败", e))?;
    let decoder = avif_decode::Decoder::from_avif(&bytes)
        .map_err(|e| AppError::new("DECODE", format!("AVIF 解码失败：{e}")))?;
    let image = decoder
        .to_image()
        .map_err(|e| AppError::new("DECODE", format!("AVIF 解码失败：{e}")))?;
    use avif_decode::Image as AvifImage;
    let rgba: RgbaImage = match image {
        AvifImage::Rgba8(v) => {
            let (w, h) = (v.width() as u32, v.height() as u32);
            RgbaImage::from_fn(w, h, |x, y| {
                let p = v[(x as usize, y as usize)];
                image::Rgba([p.r, p.g, p.b, p.a])
            })
        }
        AvifImage::Rgb8(v) => {
            let (w, h) = (v.width() as u32, v.height() as u32);
            RgbaImage::from_fn(w, h, |x, y| {
                let p = v[(x as usize, y as usize)];
                image::Rgba([p.r, p.g, p.b, 255])
            })
        }
        AvifImage::Gray8(v) => {
            let (w, h) = (v.width() as u32, v.height() as u32);
            RgbaImage::from_fn(w, h, |x, y| {
                let p = v[(x as usize, y as usize)];
                image::Rgba([p.value(), p.value(), p.value(), 255])
            })
        }
        AvifImage::Rgb16(v) => {
            let (w, h) = (v.width() as u32, v.height() as u32);
            RgbaImage::from_fn(w, h, |x, y| {
                let p = v[(x as usize, y as usize)];
                image::Rgba([
                    (p.r >> 8) as u8,
                    (p.g >> 8) as u8,
                    (p.b >> 8) as u8,
                    255,
                ])
            })
        }
        AvifImage::Rgba16(v) => {
            let (w, h) = (v.width() as u32, v.height() as u32);
            RgbaImage::from_fn(w, h, |x, y| {
                let p = v[(x as usize, y as usize)];
                image::Rgba([
                    (p.r >> 8) as u8,
                    (p.g >> 8) as u8,
                    (p.b >> 8) as u8,
                    (p.a >> 8) as u8,
                ])
            })
        }
        AvifImage::Gray16(v) => {
            let (w, h) = (v.width() as u32, v.height() as u32);
            RgbaImage::from_fn(w, h, |x, y| {
                let p = v[(x as usize, y as usize)];
                let g = (p.value() >> 8) as u8;
                image::Rgba([g, g, g, 255])
            })
        }
    };
    Ok(DynamicImage::ImageRgba8(rgba))
}


/// 生成用于导入命名框的预览图（data URL，最长边 480）。
pub fn preview_data_url(source: &Path, ext: &str) -> AppResult<String> {
    let decoded = decode(source, ext)?;
    let resized = if decoded.width().max(decoded.height()) > 480 {
        let scale = 480.0 / decoded.width().max(decoded.height()) as f32;
        let w = ((decoded.width() as f32 * scale).round() as u32).max(1);
        let h = ((decoded.height() as f32 * scale).round() as u32).max(1);
        decoded.resize_exact(w, h, image::imageops::FilterType::Lanczos3)
    } else {
        decoded
    };
    let has_alpha = resized.color().has_alpha() && {
        let rgba = resized.to_rgba8();
        rgba.pixels().any(|p| p.0[3] < 255)
    };
    let mut buf = Vec::new();
    let mime = if has_alpha {
        resized
            .to_rgba8()
            .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
            .map_err(|e| AppError::new("PREVIEW", format!("预览编码失败：{e}")))?;
        "image/png"
    } else {
        let rgb = resized.to_rgb8();
        let mut cursor = Cursor::new(&mut buf);
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 85);
        encoder
            .encode_image(&rgb)
            .map_err(|e| AppError::new("PREVIEW", format!("预览编码失败：{e}")))?;
        "image/jpeg"
    };
    Ok(format!("data:{mime};base64,{}", BASE64.encode(buf)))
}
