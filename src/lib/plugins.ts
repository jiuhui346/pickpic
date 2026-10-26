import { api } from "./ipc";
import { useStore } from "../store/useStore";
import type { Settings, ToastKind } from "./types";

let booted = false;

interface PluginButton {
  id: string;
  label: string;
  onClick: () => void;
}

function buildApi(pluginId: string) {
  const store = () => useStore.getState();
  return {
    pluginId,
    ui: {
      addToolbarButton: (button: PluginButton) => {
        store().addPluginButton({ ...button, id: `${pluginId}:${button.id}` });
      },
    },
    images: {
      list: () => store().images,
      import: async (
        paths: string[],
        options: { categoryId?: number; tagId?: number; mode?: "move" | "copy" } = {},
      ) => {
        const results = [];
        for (const path of paths) {
          const name = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "未命名";
          const outcome = await api.importOne(path, name, options.mode ?? "move");
          if (options.categoryId) {
            await api.categoryAssign([outcome.image.id], options.categoryId);
          }
          if (options.tagId) {
            await api.tagAssign([outcome.image.id], options.tagId);
          }
          results.push(outcome.image);
        }
        await store().loadVault();
        return results;
      },
      delete: async (ids: number[]) => {
        const result = await api.deleteImages(ids);
        await store().loadVault();
        return result;
      },
      export: (ids: number[], targetDir: string, mode: "copy" | "move" = "copy") =>
        api.exportImages(ids, targetDir, mode),
      rename: async (id: number, newName: string) => {
        await api.renameImage(id, newName);
        await store().loadVault();
      },
    },
    categories: {
      list: () => store().categories,
      create: (name: string) => store().createCategory(name),
      assign: (ids: number[], categoryId: number) =>
        store().assignToCategory(ids, categoryId),
      unassign: (ids: number[], categoryId: number) =>
        store().unassignFromCategory(ids, categoryId),
    },
    tags: {
      list: () => store().tags,
      create: (name: string) => store().createTag(name),
      assign: (ids: number[], tagId: number) => store().assignTag(ids, tagId),
      unassign: (ids: number[], tagId: number) => store().unassignTag(ids, tagId),
    },
    settings: {
      get: () => store().settings,
      set: (patch: Partial<Settings>) => store().setSettings(patch),
    },
    toast: (message: string, kind: ToastKind = "info") =>
      store().pushToast({ kind, message }),
    log: (...args: unknown[]) => console.log(`[plugin:${pluginId}]`, ...args),
  };
}

/** 加载所有已启用的插件（每个插件一个 Function 沙箱作用域，仅暴露 PickPic API）。 */
export async function bootPlugins(): Promise<void> {
  if (booted) return;
  booted = true;
  try {
    const list = await api.pluginsList();
    for (const plugin of list) {
      if (!plugin.enabled || plugin.error) continue;
      try {
        const code = await api.pluginCode(plugin.id);
        const factory = new Function("PickPic", "ImageVault", `"use strict";\n${code}`);
        const pluginApi = buildApi(plugin.id);
        factory(pluginApi, pluginApi);
      } catch (error) {
        useStore.getState().pushToast({
          kind: "error",
          message: `插件「${plugin.name}」加载失败`,
          detail: String(error),
          sticky: true,
        });
      }
    }
  } catch (error) {
    useStore.getState().pushToast({
      kind: "error",
      message: "读取插件列表失败",
      detail: String(error),
    });
  }
}
