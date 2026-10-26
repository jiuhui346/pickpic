import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { api } from "../lib/ipc";
import type { McpStatus } from "../lib/types";
import { Button } from "./ui";
import { Row, SettingsSection } from "./settings/controls";

/** 设置 → MCP：开关、端口、令牌与配置复制。 */
export function McpSettingsSection() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [port, setPort] = useState(String(settings.mcpPort));
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await api.mcpStatus());
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setSettings({ mcpEnabled: !settings.mcpEnabled });
      setStatus(await api.mcpRestart());
    } finally {
      setBusy(false);
    }
  };

  const savePort = async () => {
    const value = Number(port);
    if (!Number.isInteger(value) || value < 1024 || value > 65535) {
      useStore.getState().pushToast({ kind: "error", message: "端口需在 1024–65535 之间" });
      return;
    }
    await setSettings({ mcpPort: value });
    setStatus(await api.mcpRestart());
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      useStore.getState().pushToast({ kind: "success", message });
    } catch {
      useStore.getState().pushToast({ kind: "error", message: "复制失败，请手动选择文本" });
    }
  };

  const copyStdio = async () => {
    const exe = await api.appExePath();
    const config = { mcpServers: { "image-vault": { command: exe, args: ["--mcp-stdio"] } } };
    await copyText(JSON.stringify(config, null, 2), "已复制 stdio 配置，粘贴到 Agent 的 MCP 配置里");
  };

  const copyHttp = async () => {
    const url = status?.url || `http://127.0.0.1:${settings.mcpPort}/mcp`;
    const config = {
      mcpServers: {
        "image-vault": {
          url,
          headers: { Authorization: `Bearer ${status?.token ?? settings.mcpToken}` },
        },
      },
    };
    await copyText(JSON.stringify(config, null, 2), "已复制 HTTP 配置");
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="MCP 接口"
        description="允许支持 MCP 的 Agent 操作图库；仅监听本机，需要令牌"
      >
        <Row label="服务" hint="开启后 Agent 可执行与界面相同的图片/分类/标签/设置操作">
          <Button
            variant={settings.mcpEnabled ? "primary" : "secondary"}
            onClick={() => void toggle()}
            disabled={busy}
          >
            {settings.mcpEnabled ? "已开启" : "已关闭"}
          </Button>
        </Row>
        <Row label="端口">
          <div className="flex items-center gap-2">
            <input
              value={port}
              onChange={(event) => setPort(event.target.value)}
              className="h-8 w-[90px] rounded-md border border-line bg-panel2 px-2 text-[12px] outline-none focus:border-accent"
            />
            <Button variant="secondary" onClick={() => void savePort()}>
              保存
            </Button>
          </div>
        </Row>
      </SettingsSection>

      <SettingsSection title="连接信息">
        <div className="space-y-2 py-3">
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-muted">状态</span>
            <span className={status?.running ? "text-accent" : "text-muted"}>
              {status?.running ? `运行中 · ${status.url}` : "未运行"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-muted">令牌</span>
            <span className="flex min-w-0 items-center gap-2">
              <code className="max-w-[220px] truncate text-[11px]">
                {settings.mcpToken ? (showToken ? settings.mcpToken : "••••••••") : "开启后自动生成"}
              </code>
              {settings.mcpToken && (
                <button className="shrink-0 text-accent" onClick={() => setShowToken((v) => !v)}>
                  {showToken ? "隐藏" : "显示"}
                </button>
              )}
            </span>
          </div>
          {status?.error && <div className="text-[11px] text-danger">{status.error}</div>}
        </div>
      </SettingsSection>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void copyStdio()}>
          复制 stdio 配置
        </Button>
        <Button variant="secondary" onClick={() => void copyHttp()}>
          复制 HTTP 配置
        </Button>
        <Button variant="ghost" onClick={() => void refresh()}>
          刷新状态
        </Button>
      </div>
      <p className="hint-text text-[11px] leading-4 text-muted">
        stdio 适合只支持命令行的 Agent；HTTP 适合支持 URL 的 Agent。修改开关或端口后立即生效。
      </p>
    </div>
  );
}
