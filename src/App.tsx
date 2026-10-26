import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore, tasksFromPaths } from "./store/useStore";
import { api } from "./lib/ipc";
import type { AppError, ImageMeta, ProbeResult } from "./lib/types";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { Grid } from "./components/Grid";
import { StatusBar } from "./components/StatusBar";
import { NamingDialog } from "./components/NamingDialog";
import { SettingsPanel } from "./components/SettingsPanel";
import { Preview } from "./components/Preview";
import { Onboarding } from "./components/Onboarding";
import { ToastHost } from "./components/ToastHost";
import { DragOverlay } from "./components/DragOverlay";
import { FolderPrompt } from "./components/FolderPrompt";
import { Banner } from "./components/Banner";
import { DeleteConfirm } from "./components/DeleteConfirm";
import { DuplicateDialog } from "./components/DuplicateDialog";
import { TagAssignDialog } from "./components/TagAssignDialog";
import { matchesShortcut, parseShortcuts } from "./lib/shortcuts";
import { bootPlugins } from "./lib/plugins";
import { ImportProgress } from "./components/ImportProgress";
import { BatchBar } from "./components/BatchBar";
import { fileNameOf } from "./lib/format";

export default function App() {
  const phase = useStore((s) => s.phase);
  const theme = useStore((s) => s.settings.theme);
  const hideHints = useStore((s) => s.settings.hideHints);

  useEffect(() => {
    void useStore.getState().init();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      void getCurrentWindow()
        .setTheme(dark ? "dark" : "light")
        .catch(() => undefined);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.hints = hideHints ? "off" : "on";
  }, [hideHints]);

  useEffect(() => {
    if (phase === "main") void bootPlugins();
  }, [phase]);

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      {phase === "loading" && <Splash />}
      {phase === "onboarding" && <Onboarding />}
      {phase === "main" && <MainWindow />}
      <ImportProgress />
      <ToastHost />
      <DragOverlay />
    </div>
  );
}

function Splash() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <span className="flex h-10 w-10 animate-pulse items-center justify-center rounded-lg bg-accent text-[16px] font-semibold text-white">
          图
        </span>
        <span className="text-[12px]">正在打开图库…</span>
      </div>
    </div>
  );
}

function MainWindow() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState<{ items: ImageMeta[]; index: number } | null>(null);
  const [folderPrompt, setFolderPrompt] = useState<ProbeResult | null>(null);

  useDragIn(setFolderPrompt);

  // 全局快捷键：删除选中 / 打开设置（输入框内不触发）
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      const store = useStore.getState();
      const shortcuts = parseShortcuts(store.settings.shortcuts);
      if (matchesShortcut(event, shortcuts.settings)) {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (matchesShortcut(event, shortcuts.delete) && store.selection.length > 0) {
        event.preventDefault();
        store.requestDelete(store.selection);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const proceedFolder = async (mode: "batch" | "individual") => {
    const probe = folderPrompt;
    setFolderPrompt(null);
    if (!probe) return;
    const store = useStore.getState();
    try {
      const all = [...probe.images];
      for (const dir of probe.dirs) {
        const files = await api.scanFolder(dir.path);
        all.push(...files);
      }
      if (all.length === 0) {
        store.pushToast({ kind: "error", message: "文件夹里没有可导入的图片" });
        return;
      }
      store.startImport(tasksFromPaths(all), mode === "batch");
    } catch (error) {
      store.pushToast({
        kind: "error",
        message: "读取文件夹失败",
        detail: (error as AppError).message,
        sticky: true,
      });
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
        <Banner />
        <div className="min-h-0 flex-1">
          <Grid onPreview={(items, index) => setPreview({ items, index })} />
        </div>
        <StatusBar />
      </div>

      <NamingDialog />
      <BatchBar />
      <DeleteConfirm />
      <DuplicateDialog />
      <TagAssignDialog />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {preview && (
        <Preview
          items={preview.items}
          index={preview.index}
          onIndexChange={(index) =>
            setPreview((current) => (current ? { ...current, index } : current))
          }
          onClose={() => setPreview(null)}
        />
      )}
      {folderPrompt && (
        <FolderPrompt
          probe={folderPrompt}
          onCancel={() => setFolderPrompt(null)}
          onProceed={(mode) => void proceedFolder(mode)}
        />
      )}
    </div>
  );
}

/** 监听 Tauri 的原生文件拖入事件。 */
function useDragIn(onFolders: (probe: ProbeResult) => void) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const handleDrop = async (paths: string[]) => {
      const store = useStore.getState();
      try {
        const probe = await api.probePaths(paths);
        if (probe.rejected.length > 0) {
          store.pushToast({
            kind: "error",
            message: `已拒绝 ${probe.rejected.length} 个非图片文件`,
            detail: probe.rejected
              .slice(0, 8)
              .map((item) => `${fileNameOf(item.path)}：${item.reason}`)
              .join("\n"),
            sticky: true,
          });
        }
        if (probe.dirs.length > 0) {
          onFolders(probe);
          return;
        }
        if (probe.images.length > 0) {
          store.startImport(tasksFromPaths(probe.images), false);
        } else if (probe.rejected.length === 0) {
          store.pushToast({ kind: "info", message: "没有发现可导入的图片" });
        }
      } catch (error) {
        store.pushToast({
          kind: "error",
          message: "读取拖入内容失败",
          detail: (error as AppError).message,
          sticky: true,
        });
      }
    };

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          useStore.getState().setDragActive(true);
        } else if (payload.type === "leave") {
          useStore.getState().setDragActive(false);
        } else if (payload.type === "drop") {
          useStore.getState().setDragActive(false);
          void handleDrop(payload.paths);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onFolders]);
}
