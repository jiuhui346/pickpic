//! 文件名清洗：非法字符、保留设备名、长度截断。

const ILLEGAL: [char; 9] = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];

fn is_reserved(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    if ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str()) {
        return true;
    }
    let bytes = upper.as_bytes();
    if bytes.len() == 4 {
        let (prefix, digit) = (&upper[..3], &upper[3..]);
        if (prefix == "COM" || prefix == "LPT") && digit.chars().all(|c| c.is_ascii_digit()) {
            return true;
        }
    }
    false
}

/// 清洗用户输入的主名（不含扩展名）。
/// 返回最终主名与需要告知用户的提示。
pub fn sanitize_base(input: &str, fallback: &str) -> (String, Vec<String>) {
    let mut warnings = Vec::new();
    let mut name = input.trim().to_string();

    if name.is_empty() {
        name = fallback.trim().to_string();
        if name.is_empty() {
            name = "未命名".to_string();
        }
        warnings.push("名称为空，已使用原文件名".to_string());
    }

    if name
        .chars()
        .any(|c| ILLEGAL.contains(&c) || c.is_control())
    {
        name = name
            .chars()
            .map(|c| {
                if ILLEGAL.contains(&c) || c.is_control() {
                    '_'
                } else {
                    c
                }
            })
            .collect();
        warnings.push("已替换 Windows 非法字符".to_string());
    }

    let trimmed = name.trim_end_matches(['.', ' ']).to_string();
    if trimmed != name {
        name = trimmed;
        warnings.push("已去掉名称末尾的空格或句点".to_string());
    }

    if name.is_empty() {
        name = fallback.trim().to_string();
        if name.is_empty() {
            name = "未命名".to_string();
        }
        warnings.push("清洗后名称为空，已使用原文件名".to_string());
    }

    if is_reserved(&name) {
        name = format!("_{name}");
        warnings.push("该名称是 Windows 保留名，已自动加前缀".to_string());
    }

    (name, warnings)
}

/// 按字符数截断主名，返回是否发生了截断。
pub fn truncate_base(base: &str, max_chars: usize) -> (String, bool) {
    if base.chars().count() <= max_chars {
        return (base.to_string(), false);
    }
    let cut: String = base.chars().take(max_chars).collect();
    let cut = cut.trim_end_matches(['.', ' ']).to_string();
    (cut, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_illegal_chars() {
        let (name, warn) = sanitize_base("a/b:c*d", "x");
        assert_eq!(name, "a_b_c_d");
        assert!(!warn.is_empty());
    }

    #[test]
    fn falls_back_when_empty() {
        let (name, _) = sanitize_base("   ", "原名");
        assert_eq!(name, "原名");
    }

    #[test]
    fn handles_reserved_names() {
        let (name, _) = sanitize_base("CON", "x");
        assert_eq!(name, "_CON");
    }

    #[test]
    fn trims_trailing_dots() {
        let (name, _) = sanitize_base("abc...", "x");
        assert_eq!(name, "abc");
    }
}
