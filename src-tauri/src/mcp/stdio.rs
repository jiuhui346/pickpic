//! stdio 适配：把 MCP 的 stdio 请求转发到正在运行的应用 HTTP 端点。
//! 用法：`image-vault.exe --mcp-stdio`

use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;

fn config_path() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(base).join("ImageVault").join("mcp.json")
}

pub fn run() -> i32 {
    let path = config_path();
    let Ok(text) = std::fs::read_to_string(&path) else {
        eprintln!("未找到 {}，请先在 Image Vault 设置里开启 MCP 接口", path.display());
        return 1;
    };
    let Ok(config) = serde_json::from_str::<Value>(&text) else {
        eprintln!("mcp.json 格式不正确");
        return 1;
    };
    let port = config["port"].as_u64().unwrap_or(45871);
    let token = config["token"].as_str().unwrap_or("").to_string();
    let url = format!("http://127.0.0.1:{port}/mcp");

    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let request_id = serde_json::from_str::<Value>(&line)
            .ok()
            .and_then(|v| v.get("id").cloned());
        let response = ureq::post(&url)
            .set("Authorization", &format!("Bearer {token}"))
            .set("Content-Type", "application/json")
            .send_string(&line);
        let payload = match response {
            Ok(resp) => resp.into_string().unwrap_or_default(),
            Err(ureq::Error::Status(_, resp)) => resp.into_string().unwrap_or_default(),
            Err(err) => json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32603, "message": format!("无法连接 Image Vault：{err}")}
            })
            .to_string(),
        };
        let _ = writeln!(stdout, "{payload}");
        let _ = stdout.flush();
    }
    0
}
