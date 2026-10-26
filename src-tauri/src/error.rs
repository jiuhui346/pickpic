//! 统一错误类型：IPC 返回给前端时序列化为 `{ code, message, detail }`。
//! `message` 必须是用户能看懂的中文，`detail` 只用于排查。

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use std::fmt;

#[derive(Debug, Clone)]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            detail: None,
        }
    }

    /// 把系统 IO 错误翻译成人话，同时保留原始错误到 detail。
    pub fn io(context: &str, err: std::io::Error) -> Self {
        Self {
            code: "IO".to_string(),
            message: format!("{context}：{}", human_io(&err)),
            detail: Some(err.to_string()),
        }
    }

    pub fn db(err: rusqlite::Error) -> Self {
        Self {
            code: "DB".to_string(),
            message: format!("数据库操作失败：{err}"),
            detail: Some(err.to_string()),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "INTERNAL".to_string(),
            message: message.into(),
            detail: None,
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("AppError", 3)?;
        state.serialize_field("code", &self.code)?;
        state.serialize_field("message", &self.message)?;
        state.serialize_field("detail", &self.detail)?;
        state.end()
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        Self::db(err)
    }
}

impl From<image::ImageError> for AppError {
    fn from(err: image::ImageError) -> Self {
        Self {
            code: "IMAGE".to_string(),
            message: "图片解码失败".to_string(),
            detail: Some(err.to_string()),
        }
    }
}

/// Windows 常见错误码 → 用户可读文案。
pub fn human_io(err: &std::io::Error) -> String {
    match err.raw_os_error() {
        Some(2) => "找不到文件".to_string(),
        Some(3) => "找不到路径".to_string(),
        Some(5) => "没有访问权限（文件可能只读，或被系统保护）".to_string(),
        Some(19) => "磁盘处于写保护状态".to_string(),
        Some(21) => "磁盘未就绪（可能未插入）".to_string(),
        Some(32) => "文件正在被其他程序占用".to_string(),
        Some(33) => "文件被锁定，暂时无法操作".to_string(),
        Some(39) => "磁盘已满".to_string(),
        Some(112) => "磁盘空间不足".to_string(),
        Some(123) => "文件名不合法".to_string(),
        Some(206) => "路径太长".to_string(),
        _ => err.to_string(),
    }
}
