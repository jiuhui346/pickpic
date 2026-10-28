import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppError,
  Category,
  DeleteResult,
  DuplicateInfo,
  Tag,
  McpStatus,
  PluginInfo,
  RemotePlugin,
  ExportMoveResult,
  ImageMeta,
  ImportOutcome,
  ProbeResult,
  ScanReport,
  Settings,
  ThumbResult,
  VaultInfo,
  VaultStatus,
} from "./types";

/** 把 Tauri 抛出的错误统一成 { code, message, detail }。 */
export function normalizeError(error: unknown): AppError {
  if (typeof error === "object" && error !== null && "message" in error) {
    const value = error as Partial<AppError>;
    return {
      code: value.code ?? "UNKNOWN",
      message: value.message ?? "操作失败",
      detail: value.detail ?? null,
    };
  }
  if (typeof error === "string") {
    return { code: "UNKNOWN", message: error, detail: null };
  }
  return { code: "UNKNOWN", message: "操作失败，请重试", detail: String(error) };
}

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

export const api = {
  vaultBoot: () => call<VaultStatus>("vault_boot"),
  suggestedVaultPath: () => call<string>("suggested_vault_path"),
  vaultChoose: (path: string) => call<VaultInfo>("vault_choose", { path }),
  vaultInfo: () => call<VaultInfo>("vault_info"),
  vaultMigrate: async (
    newPath: string,
    onProgress: (done: number, total: number, current: string) => void,
  ) => {
    const unlisten = await listen<{ done: number; total: number; current: string }>(
      "vault-migrate-progress",
      (event) => onProgress(event.payload.done, event.payload.total, event.payload.current),
    );
    try {
      return await call<VaultInfo>("vault_migrate", { newPath });
    } finally {
      unlisten();
    }
  },
  imagesList: () => call<ImageMeta[]>("images_list"),
  sourcePreview: (path: string) => call<string>("source_preview", { path }),
  probePaths: (paths: string[]) => call<ProbeResult>("probe_paths", { paths }),
  scanFolder: (path: string) => call<string[]>("scan_folder", { path }),
  importOne: (source: string, name: string, mode: string) =>
    call<ImportOutcome>("import_one", { source, name, mode }),
  thumbEnsure: (id: number) => call<ThumbResult>("thumb_ensure", { id }),
  dragIcon: (id: number) => call<string>("drag_icon", { id }),
  dragBegin: () => call<number>("drag_begin"),
  dragEndCheck: () => call<string[]>("drag_end_check"),
  imagePaths: (ids: number[]) => call<string[]>("image_paths", { ids }),
  exportMove: (ids: number[]) => call<ExportMoveResult>("export_move", { ids }),
  deleteImages: (ids: number[]) => call<DeleteResult>("delete_images", { ids }),
  findDuplicate: (source: string) => call<DuplicateInfo | null>("find_duplicate", { source }),
  backfillHashes: () => call<number>("backfill_hashes"),
  discardFiles: (rels: string[]) => call<number>("discard_files", { rels }),
  maintenanceScan: () => call<ScanReport>("maintenance_scan"),
  importExisting: (rels: string[]) => call<number>("import_existing", { rels }),
  rebuildIndex: () => call<number>("rebuild_index"),
  categoriesList: () => call<Category[]>("categories_list"),
  categoryCreate: (name: string) => call<Category>("category_create", { name }),
  categoryRename: (id: number, name: string) => call<void>("category_rename", { id, name }),
  categoryDelete: (id: number) => call<void>("category_delete", { id }),
  categoryAssign: (imageIds: number[], categoryId: number) =>
    call<void>("category_assign", { imageIds, categoryId }),
  categoryUnassign: (imageIds: number[], categoryId: number) =>
    call<void>("category_unassign", { imageIds, categoryId }),
  settingsGet: () => call<Settings>("settings_get"),
  settingsSet: (patch: Partial<Settings>) => call<Settings>("settings_set", { patch }),
  tagsList: () => call<Tag[]>("tags_list"),
  tagCreate: (name: string) => call<Tag>("tag_create", { name }),
  tagAssign: (imageIds: number[], tagId: number) =>
    call<void>("tag_assign", { imageIds, tagId }),
  tagUnassign: (imageIds: number[], tagId: number) =>
    call<void>("tag_unassign", { imageIds, tagId }),
  exportImages: (ids: number[], targetDir: string, mode: string) =>
    call<{ exported: number[]; failed: string[] }>("export_images", { ids, targetDir, mode }),
  renameImage: (id: number, newName: string) =>
    call<void>("rename_image", { id, newName }),
  mcpStatus: () => call<McpStatus>("mcp_status"),
  mcpRestart: () => call<McpStatus>("mcp_restart"),
  pluginsList: () => call<PluginInfo[]>("plugins_list"),
  pluginCode: (id: string) => call<string>("plugin_code", { id }),
  pluginSetEnabled: (id: string, enabled: boolean) =>
    call<void>("plugin_set_enabled", { id, enabled }),
  pluginsOpenDir: () => call<void>("plugins_open_dir"),
  pluginInstall: (source: string) => call<void>("plugin_install", { source }),
  pluginRepoList: (url: string) => call<RemotePlugin[]>("plugin_repo_list", { url }),
  pluginRepoInstall: (url: string, id: string) =>
    call<void>("plugin_repo_install", { url, id }),
  appExePath: () => call<string>("app_exe_path"),
};
