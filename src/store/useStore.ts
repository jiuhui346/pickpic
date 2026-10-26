import { create } from "zustand";
import { api } from "../lib/ipc";
import { fileNameOf } from "../lib/format";
import type { Toast } from "../lib/types";
import { DEFAULT_SETTINGS, type AppStore } from "./storeTypes";
import {
  advanceImport,
  defaultTagId,
  errMessage,
  importCurrent,
  nameWithTag,
} from "./importFlow";
import * as categoryActions from "./categoryActions";

export { tasksFromPaths } from "./importFlow";

let toastSeq = 1;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();


export const useStore = create<AppStore>()((set, get) => ({
  phase: "loading",
  bootError: null,
  vaultRootHint: null,
  vault: null,
  settings: DEFAULT_SETTINGS,
  images: [],
  categories: [],
  tags: [],
  tagFilter: null,
  tagEditor: null,
  pluginButtons: [],
  activeCat: "all",
  selection: [],
  focusId: null,
  visibleIds: [],
  pendingImport: [],
  importTotal: 0,
  importDone: 0,
  importSuccess: 0,
  importFail: 0,
  importing: false,
  autoImport: false,
  importCancelled: false,
  importBuffer: [],
  duplicatePrompt: null,
  lastTagId: null,
  toasts: [],
  banner: null,
  dragActive: false,
  internalDragActive: false,
  pendingDelete: null,

  init: async () => {
    try {
      const status = await api.vaultBoot();
      if (!status.configured) {
        set({ phase: "onboarding", bootError: null, vaultRootHint: null });
        return;
      }
      if (!status.ready) {
        set({
          phase: "onboarding",
          bootError: status.error ?? "存储目录不可用",
          vaultRootHint: status.root,
        });
        return;
      }
      await get().loadVault();
      if (status.recoveredBackup) {
        get().pushToast({
          kind: "error",
          message: "检测到数据库损坏，已备份并重建索引",
          detail: `备份文件：${status.recoveredBackup}`,
          sticky: true,
        });
        const count = await api.rebuildIndex();
        if (count > 0) {
          await get().refreshImages();
          get().pushToast({ kind: "info", message: `已从原图目录恢复 ${count} 条记录` });
        }
      }
      void get().scan();
    } catch (error) {
      set({ phase: "onboarding", bootError: errMessage(error) });
    }
  },

  loadVault: async () => {
    const [settings, images, categories, tags, vault] = await Promise.all([
      api.settingsGet(),
      api.imagesList(),
      api.categoriesList(),
      api.tagsList(),
      api.vaultInfo(),
    ]);
    const recentTag =
      [...images]
        .sort((a, b) => b.importedAt - a.importedAt)
        .find((image) => image.tags.length > 0)?.tags[0] ?? null;
    set({
      phase: "main",
      settings,
      images,
      categories,
      tags,
      vault,
      bootError: null,
      selection: [],
      focusId: null,
      lastTagId: recentTag,
    });
  },

  chooseVault: async (path: string) => {
    const info = await api.vaultChoose(path);
    set({ vault: info });
    await get().loadVault();
    if (info.recoveredBackup) {
      get().pushToast({ kind: "info", message: "已备份损坏的数据库并新建图库" });
    }
    void get().scan();
  },

  retryBoot: () => {
    set({ phase: "loading", bootError: null });
    void get().init();
  },

  refreshImages: async () => {
    const images = await api.imagesList();
    set({ images });
  },

  refreshCategories: async () => {
    const categories = await api.categoriesList();
    set({ categories });
  },

  setSettings: async (patch) => {
    const previous = get().settings;
    set({ settings: { ...previous, ...patch } });
    try {
      const saved = await api.settingsSet(patch);
      set({ settings: saved });
    } catch (error) {
      set({ settings: previous });
      get().pushToast({ kind: "error", message: `保存设置失败：${errMessage(error)}` });
    }
  },

  setActiveCat: (cat) => set({ activeCat: cat, selection: [], focusId: null }),

  setVisibleIds: (ids) => set({ visibleIds: ids }),

  select: (id, mode) => {
    const { selection, focusId, visibleIds } = get();
    if (mode === "single") {
      set({ selection: [id], focusId: id });
      return;
    }
    if (mode === "toggle") {
      const next = selection.includes(id)
        ? selection.filter((x) => x !== id)
        : [...selection, id];
      set({ selection: next, focusId: id });
      return;
    }
    const start = focusId === null ? visibleIds.indexOf(id) : visibleIds.indexOf(focusId);
    const end = visibleIds.indexOf(id);
    if (start < 0 || end < 0) {
      set({ selection: [id], focusId: id });
      return;
    }
    const [lo, hi] = start < end ? [start, end] : [end, start];
    set({ selection: visibleIds.slice(lo, hi + 1), focusId: focusId ?? id });
  },

  clearSelection: () => set({ selection: [] }),

  selectAll: () => set({ selection: [...get().visibleIds] }),

  setFocus: (id) => set({ focusId: id }),

  updateImageDims: (id, width, height) =>
    set((state) => ({
      images: state.images.map((image) =>
        image.id === id ? { ...image, width, height } : image,
      ),
    })),

  startImport: (tasks, auto) => {
    if (tasks.length === 0) return;
    const current = get();
    if (current.importing) {
      set({
        pendingImport: [...current.pendingImport, ...tasks],
        importTotal: current.importTotal + tasks.length,
      });
      get().pushToast({ kind: "info", message: `已加入导入队列：${tasks.length} 个文件` });
      return;
    }
    set({
      pendingImport: tasks,
      importTotal: tasks.length,
      importDone: 0,
      importSuccess: 0,
      importFail: 0,
      autoImport: auto,
      importing: true,
      importCancelled: false,
      importBuffer: [],
      duplicatePrompt: null,
    });
    void advanceImport(get, set);
  },

  confirmName: async (name, options) => {
    await importCurrent(
      get,
      set,
      name,
      options?.tagId ?? null,
      options?.categoryId ?? null,
    );
    void advanceImport(get, set);
  },

  skipCurrent: () => {
    const state = get();
    const task = state.pendingImport[0];
    if (!task) return;
    set({
      pendingImport: state.pendingImport.slice(1),
      importDone: state.importDone + 1,
      duplicatePrompt: null,
    });
    get().pushToast({ kind: "info", message: `已跳过：${fileNameOf(task.source)}` });
    void advanceImport(get, set);
  },

  cancelAllImports: () => {
    const left = get().pendingImport.length;
    set({
      pendingImport: [],
      importing: false,
      autoImport: false,
      importCancelled: true,
      duplicatePrompt: null,
    });
    if (left > 0) get().pushToast({ kind: "info", message: `已取消剩余 ${left} 个文件` });
  },

  resolveDuplicate: async (keep) => {
    const state = get();
    const prompt = state.duplicatePrompt;
    if (!prompt) return;
    if (!keep) {
      set({
        duplicatePrompt: null,
        pendingImport: state.pendingImport.slice(1),
        importDone: state.importDone + 1,
      });
      get().pushToast({ kind: "info", message: `已跳过重复图片：${prompt.existing.fileName}` });
      void advanceImport(get, set);
      return;
    }
    set({ duplicatePrompt: null });
    if (state.autoImport) {
      const tagId = defaultTagId(state);
      const categoryId = typeof state.activeCat === "number" ? state.activeCat : null;
      const name = nameWithTag(state, prompt.task.defaultName, tagId);
      await importCurrent(get, set, name, tagId, categoryId);
      void advanceImport(get, set);
    }
    // 手动模式：清除提示后由命名框接管
  },

  setLastTag: (tagId) => set({ lastTagId: tagId }),

  setTagFilter: (tagId) => set({ tagFilter: tagId }),

  openTagEditor: (ids) => {
    if (ids.length > 0) set({ tagEditor: ids });
  },

  closeTagEditor: () => set({ tagEditor: null }),

  addPluginButton: (button) =>
    set((state) =>
      state.pluginButtons.some((item) => item.id === button.id)
        ? state
        : { pluginButtons: [...state.pluginButtons, button] },
    ),

  refreshTags: async () => {
    const tags = await api.tagsList();
    set({ tags });
  },

  createTag: async (name) => {
    try {
      const tag = await api.tagCreate(name);
      await get().refreshTags();
      return tag;
    } catch (error) {
      get().pushToast({ kind: "error", message: errMessage(error) });
      return null;
    }
  },

  assignTag: async (ids, tagId) => {
    if (ids.length === 0) return;
    try {
      await api.tagAssign(ids, tagId);
      set((s) => ({
        images: s.images.map((image) =>
          ids.includes(image.id) && !image.tags.includes(tagId)
            ? { ...image, tags: [...image.tags, tagId] }
            : image,
        ),
      }));
      await get().refreshTags();
    } catch (error) {
      get().pushToast({ kind: "error", message: `添加标签失败：${errMessage(error)}` });
    }
  },

  unassignTag: async (ids, tagId) => {
    try {
      await api.tagUnassign(ids, tagId);
      set((s) => ({
        images: s.images.map((image) =>
          ids.includes(image.id)
            ? { ...image, tags: image.tags.filter((id) => id !== tagId) }
            : image,
        ),
      }));
      await get().refreshTags();
    } catch (error) {
      get().pushToast({ kind: "error", message: `取消标签失败：${errMessage(error)}` });
    }
  },

  pushToast: (toast) => {
    const id = toastSeq++;
    const item: Toast = { id, kind: toast.kind, message: toast.message, detail: toast.detail, sticky: toast.sticky };
    set((s) => ({ toasts: [...s.toasts.slice(-2), item] }));
    if (!toast.sticky) {
      toastTimers.set(
        id,
        setTimeout(() => get().dismissToast(id), 3200),
      );
    }
  },

  dismissToast: (id) => {
    const timer = toastTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.delete(id);
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  setBanner: (banner) => set({ banner }),

  setDragActive: (active) => set({ dragActive: active }),

  setInternalDragActive: (active) => set({ internalDragActive: active }),

  assignToCategory: (ids, categoryId) => categoryActions.assignCategory(get, set, ids, categoryId),

  unassignFromCategory: (ids, categoryId) => categoryActions.unassignCategory(get, set, ids, categoryId),

  createCategory: (name) => categoryActions.createCategory(get, set, name),

  renameCategory: (id, name) => categoryActions.renameCategory(get, set, id, name),

  deleteCategory: (id) => categoryActions.deleteCategory(get, set, id),

  requestDelete: (ids) => {
    if (ids.length > 0) set({ pendingDelete: ids });
  },

  cancelDelete: () => set({ pendingDelete: null }),

  confirmDelete: async () => {
    const ids = get().pendingDelete ?? [];
    if (ids.length === 0) return;
    set({ pendingDelete: null });
    try {
      const result = await api.deleteImages(ids);
      const removed = new Set(result.deleted);
      set((s) => ({
        images: s.images.filter((image) => !removed.has(image.id)),
        selection: s.selection.filter((id) => !removed.has(id)),
      }));
      await get().refreshCategories();
      if (result.deleted.length > 0) {
        get().pushToast({ kind: "success", message: `已删除 ${result.deleted.length} 张图片` });
      }
      if (result.failed.length > 0) {
        get().pushToast({
          kind: "error",
          message: `${result.failed.length} 张删除失败，文件仍保留`,
          detail: result.failed.join("\n"),
          sticky: true,
        });
      }
    } catch (error) {
      get().pushToast({ kind: "error", message: `删除失败：${errMessage(error)}`, sticky: true });
    }
  },

  scan: async () => {
    try {
      const report = await api.maintenanceScan();
      if (report.missing > 0) {
        await get().refreshImages();
        get().pushToast({
          kind: "info",
          message: `${report.missing} 张图片在磁盘上找不到，已标记为「缺失」`,
        });
      }
      if (report.orphans.length > 0) {
        set({
          banner: {
            kind: "orphans",
            message: `发现 ${report.orphans.length} 个未入库的图片文件`,
            count: report.orphans.length,
            payload: report.orphans,
          },
        });
      }
    } catch {
      // 扫描失败不打断使用，下次启动再试
    }
  },
}));

