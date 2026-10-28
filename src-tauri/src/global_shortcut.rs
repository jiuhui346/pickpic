//! 全局快捷键解析与注册（托盘/隐藏窗口时呼出主界面）。

use std::str::FromStr;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

fn parse_code(key: &str) -> Result<Code, String> {
    let lower = key.to_ascii_lowercase();
    if lower.len() == 1 {
        let ch = lower.chars().next().unwrap();
        if ch.is_ascii_alphabetic() {
            let name = format!("Key{}", ch.to_ascii_uppercase());
            return Code::from_str(&name).map_err(|_| format!("不支持的按键：{key}"));
        }
        if ch.is_ascii_digit() {
            return Code::from_str(&format!("Digit{ch}")).map_err(|_| format!("不支持的按键：{key}"));
        }
        let name = match ch {
            ',' => "Comma",
            '.' => "Period",
            '/' => "Slash",
            ';' => "Semicolon",
            '\'' => "Quote",
            '[' => "BracketLeft",
            ']' => "BracketRight",
            '\\' => "Backslash",
            '-' => "Minus",
            '=' => "Equal",
            '`' => "Backquote",
            _ => return Err(format!("不支持的按键：{key}")),
        };
        return Code::from_str(name).map_err(|_| format!("不支持的按键：{key}"));
    }
    let name = match lower.as_str() {
        "esc" => "Escape",
        "space" => "Space",
        "enter" | "return" => "Enter",
        "tab" => "Tab",
        "backspace" => "Backspace",
        "delete" => "Delete",
        "arrowleft" | "left" => "ArrowLeft",
        "arrowright" | "right" => "ArrowRight",
        "arrowup" | "up" => "ArrowUp",
        "arrowdown" | "down" => "ArrowDown",
        other => other,
    };
    Code::from_str(name).map_err(|_| format!("不支持的按键：{key}"))
}

pub fn parse(spec: &str) -> Result<Shortcut, String> {
    let mut modifiers = Modifiers::empty();
    let mut code: Option<Code> = None;
    for part in spec.split('+').map(str::trim).filter(|p| !p.is_empty()) {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "alt" => modifiers |= Modifiers::ALT,
            "shift" => modifiers |= Modifiers::SHIFT,
            "meta" | "super" | "win" => modifiers |= Modifiers::SUPER,
            _ => {
                if code.is_some() {
                    return Err("快捷键只能包含一个主键".to_string());
                }
                code = Some(parse_code(part)?);
            }
        }
    }
    if modifiers.is_empty() {
        return Err("全局快捷键至少需要一个修饰键（Ctrl / Alt / Shift / Win）".to_string());
    }
    let code = code.ok_or_else(|| "快捷键缺少主键".to_string())?;
    Ok(Shortcut::new(Some(modifiers), code))
}

/// 启动/切换图库时应用保存的快捷键。
pub fn apply(app: &AppHandle, spec: &str) -> Result<(), String> {
    let shortcut = parse(spec)?;
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    manager
        .register(shortcut)
        .map_err(|e| format!("快捷键注册失败：{e}"))
}

/// 切换快捷键；新快捷键注册失败时恢复旧的。
pub fn apply_checked(app: &AppHandle, new_spec: &str, old_spec: &str) -> Result<(), String> {
    let shortcut = parse(new_spec)?;
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    if let Err(err) = manager.register(shortcut) {
        if let Ok(old) = parse(old_spec) {
            let _ = manager.register(old);
        }
        return Err(format!("快捷键注册失败（可能已被其他程序占用）：{err}"));
    }
    Ok(())
}
