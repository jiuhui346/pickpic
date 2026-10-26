import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store/useStore";
import { api } from "../lib/ipc";
import type { AppError } from "../lib/types";
import { formatSize } from "../lib/format";
import { Button, Modal } from "./ui";
import { IconClose } from "./icons";
import { McpSettingsSection } from "./McpSettingsSection";
import { PluginsSettingsSection } from "./PluginsSettingsSection";
import { AboutTab } from "./settings/AboutTab";
import { AppearanceTab } from "./settings/AppearanceTab";
import { GeneralTab } from "./settings/GeneralTab";
import { ShortcutsTab } from "./settings/ShortcutsTab";

type TabId = "general" | "appearance" | "shortcuts" | "mcp" | "plugins" | "about";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "general", label: "通用", hint: "存储与导入" },
  { id: "appearance", label: "外观", hint: "缩略图与主题" },
  { id: "shortcuts", label: "快捷键", hint: "按键绑定" },
  { id: "mcp", label: "MCP", hint: "Agent 接口" },
  { id: "plugins", label: "插件", hint: "扩展功能" },
  { id: "about", label: "关于", hint: "版本与数据" },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const images = useStore((s) => s.images);
  const vault = useStore((s) => s.vault);
  const [tab, setTab] = useState<TabId>("general");
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [migrating, setMigrating] = useState<{ done: number; total: number; current: string } | null>(
    null,
  );
  const totalBytes = images.reduce((sum, image) => sum + image.sizeBytes, 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !migrating && !pendingPath) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, migrating, pendingPath]);

  const pickFolder = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "选择新的图库存储目录",
      defaultPath: vault?.root,
    });
    if (typeof picked === "string" && picked !== vault?.root) {
      setPendingPath(picked);
    }
  };

  const startMigration = async () => {
    if (!pendingPath) return;
    setMigrating({ done: 0, total: 0, current: "" });
    try {
      await api.vaultMigrate(pendingPath, (done, total, current) =>
        setMigrating({ done, total, current }),
      );
      await useStore.getState().loadVault();
      useStore.getState().pushToast({ kind: "success", message: "图库已迁移到新目录" });
      setPendingPath(null);
      setMigrating(null);
      onClose();
    } catch (error) {
      setMigrating(null);
      useStore.getState().pushToast({
        kind: "error",
        message: `迁移失败：${(error as AppError).message}`,
        sticky: true,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40 fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-[720px] max-w-full flex-col border-l border-line bg-panel">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-[14px] font-semibold">设置</h2>
          <button
            className="rounded p-1.5 text-muted hover:bg-panel2 hover:text-fg"
            onClick={onClose}
          >
            <IconClose size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="w-[172px] shrink-0 border-r border-line bg-panel2/30 p-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                className={`mb-0.5 flex w-full flex-col items-start rounded-md px-3 py-2 text-left transition-colors ${
                  tab === item.id
                    ? "bg-[var(--accent-weak)] text-accent"
                    : "text-muted hover:bg-panel2 hover:text-fg"
                }`}
                onClick={() => setTab(item.id)}
              >
                <span className="text-[13px]">{item.label}</span>
                <span className="hint-text mt-0.5 text-[10px] text-muted">{item.hint}</span>
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
            {tab === "general" && <GeneralTab onPickFolder={() => void pickFolder()} />}
            {tab === "appearance" && <AppearanceTab />}
            {tab === "shortcuts" && <ShortcutsTab />}
            {tab === "mcp" && <McpSettingsSection />}
            {tab === "plugins" && <PluginsSettingsSection />}
            {tab === "about" && <AboutTab />}
          </div>
        </div>
      </div>

      {pendingPath && !migrating && (
        <Modal
          title="迁移图库"
          onClose={() => setPendingPath(null)}
          width={460}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingPath(null)}>
                取消
              </Button>
              <Button variant="primary" onClick={() => void startMigration()}>
                开始迁移
              </Button>
            </>
          }
        >
          <p className="text-[13px] leading-6">
            将把当前图库（{images.length} 张，{formatSize(totalBytes)}）完整复制到：
          </p>
          <p className="mt-2 break-all rounded-md bg-panel2 px-3 py-2 text-[12px]">{pendingPath}</p>
          <p className="mt-3 text-[12px] leading-5 text-muted">
            迁移完成后自动切换到新目录；旧目录会保留，确认无误后可自行删除。
          </p>
        </Modal>
      )}

      {migrating && (
        <Modal title="正在迁移图库" width={460}>
          <div className="text-[13px]">
            {migrating.total > 0
              ? `正在复制 ${migrating.done}/${migrating.total} 个文件`
              : "正在准备…"}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel2">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{
                width: `${migrating.total > 0 ? Math.round((migrating.done / migrating.total) * 100) : 5}%`,
              }}
            />
          </div>
          <div className="mt-2 truncate text-[11px] text-muted">{migrating.current}</div>
        </Modal>
      )}
    </div>
  );
}
