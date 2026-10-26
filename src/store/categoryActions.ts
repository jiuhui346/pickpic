import { api } from "../lib/ipc";
import type { Category } from "../lib/types";
import { errMessage } from "./importFlow";
import type { StoreGetter, StoreSetter } from "./storeTypes";

/** 归类（多对多：一张图可属于多个分类）。 */
export async function assignCategory(
  get: StoreGetter,
  set: StoreSetter,
  ids: number[],
  categoryId: number,
): Promise<void> {
  if (ids.length === 0) return;
  try {
    await api.categoryAssign(ids, categoryId);
    set((s) => ({
      images: s.images.map((img) =>
        ids.includes(img.id) && !img.categories.includes(categoryId)
          ? { ...img, categories: [...img.categories, categoryId] }
          : img,
      ),
    }));
    await get().refreshCategories();
    const name = get().categories.find((c) => c.id === categoryId)?.name ?? "";
    get().pushToast({ kind: "success", message: `已将 ${ids.length} 张图片归入「${name}」` });
  } catch (error) {
    get().pushToast({ kind: "error", message: `归类失败：${errMessage(error)}` });
  }
}

export async function unassignCategory(
  get: StoreGetter,
  set: StoreSetter,
  ids: number[],
  categoryId: number,
): Promise<void> {
  try {
    await api.categoryUnassign(ids, categoryId);
    set((s) => ({
      images: s.images.map((img) =>
        ids.includes(img.id)
          ? { ...img, categories: img.categories.filter((c) => c !== categoryId) }
          : img,
      ),
    }));
    await get().refreshCategories();
  } catch (error) {
    get().pushToast({ kind: "error", message: `取消归类失败：${errMessage(error)}` });
  }
}

export async function createCategory(
  get: StoreGetter,
  set: StoreSetter,
  name: string,
): Promise<Category | null> {
  void set;
  try {
    const category = await api.categoryCreate(name);
    await get().refreshCategories();
    return category;
  } catch (error) {
    get().pushToast({ kind: "error", message: errMessage(error) });
    return null;
  }
}

export async function renameCategory(
  get: StoreGetter,
  set: StoreSetter,
  id: number,
  name: string,
): Promise<boolean> {
  void set;
  try {
    await api.categoryRename(id, name);
    await get().refreshCategories();
    return true;
  } catch (error) {
    get().pushToast({ kind: "error", message: errMessage(error) });
    return false;
  }
}

/** 删除分类：只解除关联，图片与文件保持不动。 */
export async function deleteCategory(
  get: StoreGetter,
  set: StoreSetter,
  id: number,
): Promise<boolean> {
  try {
    await api.categoryDelete(id);
    set((s) => ({
      images: s.images.map((img) => ({
        ...img,
        categories: img.categories.filter((c) => c !== id),
      })),
      activeCat: s.activeCat === id ? "all" : s.activeCat,
    }));
    await get().refreshCategories();
    get().pushToast({ kind: "success", message: "分类已删除，图片本身未受影响" });
    return true;
  } catch (error) {
    get().pushToast({ kind: "error", message: `删除分类失败：${errMessage(error)}` });
    return false;
  }
}
