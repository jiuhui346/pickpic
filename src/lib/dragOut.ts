import { Channel, invoke } from "@tauri-apps/api/core";
import { api } from "./ipc";
import { useStore } from "../store/useStore";

/** 1x1 透明 PNG：没有缩略图时也能启动系统拖拽。 */
const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let running = false;

interface DragCallback {
  result: "Dropped" | "Cancel";
}

/**
 * 从图库拖出真实文件。
 * 先记录快照（检测拖回库目录），拖拽结束后按设置决定是否"移动出库"。
 */
export async function startDragOut(ids: number[]): Promise<void> {
  const log = (step: string) => {
    const target = window as unknown as { __dragLog?: string[] };
    target.__dragLog = [...(target.__dragLog ?? []), `${Date.now()} ${step}`];
  };
  log("enter " + ids.join(","));
  if (running || ids.length === 0) return;
  running = true;
  const store = useStore.getState();
  try {
    await api.dragBegin();
    log("snapshot ok");
    const paths = await api.imagePaths(ids);
    if (paths.length === 0) {
      store.pushToast({ kind: "error", message: "所选图片在磁盘上不存在" });
      return;
    }
    const icon = await api.dragIcon(ids[0]);

    let dropped = false;
    const channel = new Channel<DragCallback>();
    channel.onmessage = (message) => {
      if (message.result === "Dropped") dropped = true;
    };

    log("invoking plugin, paths=" + paths.length + " icon=" + (icon ? icon.length : 0));
    await invoke("plugin:drag|start_drag", {
      item: paths,
      image: icon || TRANSPARENT_PNG,
      options: { mode: "copy" },
      onEvent: channel,
    });
    log("plugin returned dropped=" + dropped);

    const selfDropped = useStore.getState().importing ? [] : await api.dragEndCheck();
    log("selfcheck=" + selfDropped.length);
    if (selfDropped.length > 0) {
      store.pushToast({
        kind: "error",
        message: "不能把图片拖回图库目录，已撤销",
        detail: selfDropped.join("\n"),
        sticky: true,
      });
      return;
    }
    if (!dropped) return;

    if (store.settings.exportMode === "move") {
      const result = await api.exportMove(ids);
      if (result.removed > 0) {
        useStore.setState((state) => ({
          images: state.images.filter((image) => !ids.includes(image.id)),
          selection: [],
        }));
        await store.refreshCategories();
      }
      if (result.failed.length > 0) {
        store.pushToast({
          kind: "error",
          message: `有 ${result.failed.length} 张未能从库中移除，文件仍保留`,
          detail: result.failed.join("\n"),
          sticky: true,
        });
      } else {
        store.pushToast({ kind: "success", message: `已移出图库 ${result.removed} 张` });
      }
    } else {
      store.pushToast({ kind: "success", message: `已导出 ${paths.length} 张图片（库内保留）` });
    }
  } catch (error) {
    const message = (error as { message?: string })?.message ?? String(error);
    useStore.getState().pushToast({ kind: "error", message: `拖出失败：${message}`, sticky: true });
  } finally {
    running = false;
  }
}
