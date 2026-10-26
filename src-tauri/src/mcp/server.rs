//! 本地 MCP HTTP 服务（JSON-RPC 2.0，Streamable HTTP 的请求/响应子集）。

use crate::mcp::tools;
use crate::models::Settings;
use crate::state::AppState;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tiny_http::{Header, Method, Response, Server};

pub struct McpServer {
    stop: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
    pub port: u16,
}

impl McpServer {
    fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub enabled: bool,
    pub running: bool,
    pub port: u16,
    pub token: String,
    pub url: String,
    pub error: Option<String>,
}

fn config_path() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(base).join("ImageVault").join("mcp.json")
}

fn write_config(enabled: bool, port: u16, token: &str) {
    let path = config_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let value = json!({"enabled": enabled, "port": port, "token": token});
    let _ = fs::write(path, serde_json::to_string_pretty(&value).unwrap_or_default());
}

/// 启停 MCP 服务并同步 mcp.json（stdio 模式读取它）。
pub fn apply(app: &AppHandle, settings: &Settings) -> McpStatus {
    let mut error = None;
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut guard) = state.mcp.lock() {
            if let Some(mut server) = guard.take() {
                server.stop();
            }
            if settings.mcp_enabled {
                match start(app.clone(), settings.mcp_port, settings.mcp_token.clone()) {
                    Ok(server) => *guard = Some(server),
                    Err(err) => error = Some(err),
                }
            }
        }
    }
    write_config(settings.mcp_enabled, settings.mcp_port, &settings.mcp_token);
    status(app, &settings.mcp_token, error)
}

pub fn status(app: &AppHandle, token: &str, error: Option<String>) -> McpStatus {
    let mut running = false;
    let mut port = 0;
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(guard) = state.mcp.lock() {
            if let Some(server) = guard.as_ref() {
                running = true;
                port = server.port;
            }
        }
    }
    McpStatus {
        enabled: running,
        running,
        port,
        token: token.to_string(),
        url: if running {
            format!("http://127.0.0.1:{port}/mcp")
        } else {
            String::new()
        },
        error,
    }
}

fn start(app: AppHandle, port: u16, token: String) -> Result<McpServer, String> {
    // 热重启时端口可能短暂被上一个进程占用，重试几次
    let mut attempts = 0;
    let server = loop {
        match Server::http(("127.0.0.1", port)) {
            Ok(server) => break server,
            Err(err) => {
                attempts += 1;
                if attempts >= 8 {
                    return Err(format!("无法监听 127.0.0.1:{port}：{err}"));
                }
                thread::sleep(Duration::from_millis(300));
            }
        }
    };
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = stop.clone();
    let handle = thread::spawn(move || {
        while !stop_flag.load(Ordering::SeqCst) {
            match server.recv_timeout(Duration::from_millis(400)) {
                Ok(Some(request)) => handle_request(&app, request, &token),
                Ok(None) => {}
                Err(_) => break,
            }
        }
    });
    Ok(McpServer {
        stop,
        handle: Some(handle),
        port,
    })
}

fn handle_request(app: &AppHandle, mut request: tiny_http::Request, token: &str) {
    if request.method() == &Method::Options {
        let _ = request.respond(
            Response::empty(tiny_http::StatusCode(204)).with_header(cors_header()),
        );
        return;
    }
    if request.method() != &Method::Post || request.url() != "/mcp" {
        let _ = request.respond(
            Response::from_string("not found").with_status_code(tiny_http::StatusCode(404)),
        );
        return;
    }
    let authorized = request.headers().iter().any(|header| {
        header.field.equiv("Authorization")
            && header.value.as_str() == format!("Bearer {token}")
    });
    if !authorized {
        let _ = request.respond(
            Response::from_string(r#"{"error":"unauthorized"}"#)
                .with_status_code(tiny_http::StatusCode(401))
                .with_header(json_header()),
        );
        return;
    }
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        return;
    }
    let Ok(payload) = serde_json::from_str::<Value>(&body) else {
        let _ = request.respond(
            Response::from_string(r#"{"jsonrpc":"2.0","error":{"code":-32700,"message":"parse error"},"id":null}"#)
                .with_header(json_header()),
        );
        return;
    };
    let id = payload.get("id").cloned();
    let method = payload.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let params = payload.get("params").cloned().unwrap_or(json!({}));

    if id.is_none() {
        let _ = request.respond(
            Response::empty(tiny_http::StatusCode(202)).with_header(cors_header()),
        );
        return;
    }

    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": params.get("protocolVersion").and_then(|v| v.as_str()).unwrap_or("2025-03-26"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "image-vault", "version": env!("CARGO_PKG_VERSION")}
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools": tools::tools()})),
        "tools/call" => {
            let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(json!({}));
            match tools::dispatch(app, name, &args) {
                Ok(value) => Ok(json!({
                    "content": [{"type": "text", "text": serde_json::to_string_pretty(&value).unwrap_or_default()}]
                })),
                Err(message) => Ok(json!({
                    "content": [{"type": "text", "text": message}],
                    "isError": true
                })),
            }
        }
        other => Err(format!("unknown method: {other}")),
    };

    let response_body = match result {
        Ok(value) => json!({"jsonrpc": "2.0", "id": id, "result": value}),
        Err(message) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {"code": -32601, "message": message}
        }),
    };
    let _ = request.respond(
        Response::from_string(response_body.to_string())
            .with_header(json_header())
            .with_header(cors_header()),
    );
}

fn json_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap()
}

fn cors_header() -> Header {
    Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap()
}
