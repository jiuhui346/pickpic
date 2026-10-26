//! 文件内容哈希（用于重复图片检测）。

use crate::error::{AppError, AppResult};
use std::fs::File;
use std::io::Read;
use std::path::Path;

/// 计算文件的 BLAKE3 哈希（流式读取，避免大图占内存）。
pub fn file_hash(path: &Path) -> AppResult<String> {
    let mut file = File::open(crate::core::fsutil::fs_path(path))
        .map_err(|e| AppError::io("读取图片失败", e))?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| AppError::io("读取图片失败", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}
