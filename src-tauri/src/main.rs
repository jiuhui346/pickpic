// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // MCP stdio 模式：作为 MCP 客户端与正在运行的图库之间的桥
    if std::env::args().any(|arg| arg == "--mcp-stdio") {
        std::process::exit(pickpic_lib::run_mcp_stdio());
    }
    pickpic_lib::run()
}
