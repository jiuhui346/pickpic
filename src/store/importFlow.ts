import { api } from "../lib/ipc";
import { baseNameOf } from "../lib/format";
import type { AppError, DuplicateInfo, ImportTask } from "../lib/types";
import type { StoreGetter, StoreSetter } from "./storeTypes";

/** 把 Tauri 错误转成一句话。 */
export function errMessage(error: unknown): string {
  const err = error as AppError;
  return err?.message ?? "操作失败";
}

/** 默认标签：当前分类（若在分类页）或上一次使用的标签。 */
export function defaultTagId(state: ReturnType<StoreGetter>): number | null {
  if (state.lastTagId && state.tags.some((c) => c.id === state.lastTagId)) {
    return state.lastTagId;
  }
  if (typeof state.activeCat === "number") return state.activeCat;
  return null;
}

function tagNameOf(state: ReturnType<StoreGetter>, tagId: number | null): string | null {
  if (!tagId) return null;
  return state.tags.find((c) => c.id === tagId)?.name ?? null;
}

/** 带标签前缀的默认文件名。 */
export function nameWithTag(state: ReturnType<StoreGetter>, base: string, tagId: number | null): string {
  const tag = tagNameOf(state, tagId);
  return tag ? `${tag}_${base}` : base;
}

/** 导入队列中的下一张（对话框确认 / 批量自动都会走这里）。 */
export async function importCurrent(
  get: StoreGetter,
  set: StoreSetter,
  name: string,
  tagId?: number | null,
  categoryId?: number | null,
): Promise<void> {
  const state = get();
  const task = state.pendingImport[0];
  if (!task) return;
  const effectiveTag = tagId ?? null;
  const effectiveCategory = categoryId ?? null;
  try {
    const outcome = await api.importOne(task.source, name, state.settings.importMode);

    // 分类：命名框选中的一个分类（未分类 = null）
    const categories: number[] = [];
    if (effectiveCategory) {
      try {
        await api.categoryAssign([outcome.image.id], effectiveCategory);
        categories.push(effectiveCategory);
        await get().refreshCategories();
      } catch {
        // 归类失败不阻断导入，可在右键菜单手动归类
      }
    }
    // 标签：用于分类内筛选
    const tags: number[] = [];
    if (effectiveTag) {
      try {
        await api.tagAssign([outcome.image.id], effectiveTag);
        tags.push(effectiveTag);
        await get().refreshTags();
        get().setLastTag(effectiveTag);
      } catch {
        // 打标签失败不阻断导入
      }
    }
    outcome.image.categories = categories;
    outcome.image.tags = tags;

    set((s) => {
      const buffer = [...s.importBuffer, outcome.image];
      const flush = !state.autoImport || buffer.length >= 200;
      return {
        images: flush ? [...buffer.reverse(), ...s.images] : s.images,
        importBuffer: flush ? [] : buffer,
        pendingImport: s.pendingImport.slice(1),
        importDone: s.importDone + 1,
        importSuccess: s.importSuccess + 1,
      };
    });
    if (outcome.warnings.length > 0) {
      get().pushToast({ kind: "info", message: outcome.warnings.join("；") });
    }
  } catch (error) {
    set((s) => ({
      pendingImport: s.pendingImport.slice(1),
      importDone: s.importDone + 1,
      importFail: s.importFail + 1,
    }));
    get().pushToast({
      kind: "error",
      message: `${task.defaultName} 导入失败`,
      detail: errMessage(error),
      sticky: true,
    });
  }
}

/** 推进队列：先查重复，再决定弹命名框还是自动导入。 */
export async function advanceImport(get: StoreGetter, set: StoreSetter): Promise<void> {
  const state = get();
  if (state.importCancelled || state.pendingImport.length === 0) {
    finishImport(get, set);
    return;
  }
  const task = state.pendingImport[0];
  let duplicate: DuplicateInfo | null = null;
  try {
    duplicate = await api.findDuplicate(task.source);
  } catch {
    duplicate = null;
  }
  if (duplicate) {
    set({ duplicatePrompt: { task, existing: duplicate } });
    return;
  }
  set({ duplicatePrompt: null });

  if (!state.autoImport) return; // 手动模式：命名框负责后续

  const tagId = defaultTagId(state);
  const categoryId = typeof state.activeCat === "number" ? state.activeCat : null;
  const name = nameWithTag(state, task.defaultName, tagId);
  await importCurrent(get, set, name, tagId, categoryId);
  void advanceImport(get, set);
}

/** 收尾：落盘缓存、复位状态、汇总提示。 */
export function finishImport(get: StoreGetter, set: StoreSetter): void {
  const { importSuccess, importFail, importTotal, importBuffer } = get();
  set((state) => ({
    importing: false,
    pendingImport: [],
    autoImport: false,
    duplicatePrompt: null,
    images:
      importBuffer.length > 0
        ? [...[...importBuffer].reverse(), ...state.images]
        : state.images,
    importBuffer: [],
  }));
  if (importTotal === 0) return;
  const parts = [`成功 ${importSuccess}`];
  if (importFail > 0) parts.push(`失败 ${importFail}`);
  get().pushToast({
    kind: importFail > 0 ? "error" : "success",
    message: `导入完成：${parts.join("，")}`,
    sticky: importFail > 0,
  });
}

/** 拖入队列构造：把路径转成带默认名的任务。 */
export function tasksFromPaths(paths: string[]): ImportTask[] {
  return paths.map((source) => ({ source, defaultName: baseNameOf(source) }));
}
