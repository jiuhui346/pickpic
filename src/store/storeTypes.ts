import type {
  BannerState,
  Category,
  DuplicateInfo,
  Tag,
  ImageMeta,
  ImportTask,
  Settings,
  Toast,
  ToastKind,
  VaultInfo,
} from "../lib/types";
import { DEFAULT_SHORTCUTS, serializeShortcuts } from "../lib/shortcuts";

export const DEFAULT_SETTINGS: Settings = {
  importMode: "move",
  exportMode: "copy",
  thumbSize: "small",
  thumbPx: 190,
  theme: "dark",
  sortField: "imported",
  sortDesc: true,
  shortcuts: serializeShortcuts(DEFAULT_SHORTCUTS),
  hideHints: false,
  animateThumbs: false,
  globalShortcut: "Ctrl+Alt+P",
  mcpEnabled: false,
  mcpPort: 45871,
  mcpToken: "",
  pluginRepoUrl: "",
};

export interface AppStore {
  phase: "loading" | "onboarding" | "main";
  bootError: string | null;
  vaultRootHint: string | null;
  vault: VaultInfo | null;
  settings: Settings;
  images: ImageMeta[];
  categories: Category[];
  tags: Tag[];
  tagFilter: number | null;
  tagEditor: number[] | null;
  pluginButtons: { id: string; label: string; onClick: () => void }[];
  activeCat: "all" | "uncat" | number;
  selection: number[];
  focusId: number | null;
  visibleIds: number[];
  pendingImport: ImportTask[];
  importTotal: number;
  importDone: number;
  importSuccess: number;
  importFail: number;
  importing: boolean;
  autoImport: boolean;
  importCancelled: boolean;
  importBuffer: ImageMeta[];
  duplicatePrompt: { task: ImportTask; existing: DuplicateInfo } | null;
  lastTagId: number | null;
  toasts: Toast[];
  banner: BannerState | null;
  dragActive: boolean;
  internalDragActive: boolean;

  init: () => Promise<void>;
  loadVault: () => Promise<void>;
  chooseVault: (path: string) => Promise<void>;
  retryBoot: () => void;
  refreshImages: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  setActiveCat: (cat: "all" | "uncat" | number) => void;
  setVisibleIds: (ids: number[]) => void;
  select: (id: number, mode: "single" | "toggle" | "range") => void;
  clearSelection: () => void;
  selectAll: () => void;
  setFocus: (id: number | null) => void;
  updateImageDims: (id: number, width: number, height: number) => void;
  startImport: (tasks: ImportTask[], auto: boolean) => void;
  confirmName: (name: string, options?: { tagId?: number | null; categoryId?: number | null }) => Promise<void>;
  skipCurrent: () => void;
  cancelAllImports: () => void;
  resolveDuplicate: (keep: boolean) => Promise<void>;
  setLastTag: (tagId: number | null) => void;
  setTagFilter: (tagId: number | null) => void;
  openTagEditor: (ids: number[]) => void;
  closeTagEditor: () => void;
  addPluginButton: (button: { id: string; label: string; onClick: () => void }) => void;
  refreshTags: () => Promise<void>;
  createTag: (name: string) => Promise<Tag | null>;
  assignTag: (ids: number[], tagId: number) => Promise<void>;
  unassignTag: (ids: number[], tagId: number) => Promise<void>;
  pushToast: (toast: { kind: ToastKind; message: string; detail?: string; sticky?: boolean }) => void;
  dismissToast: (id: number) => void;
  setBanner: (banner: BannerState | null) => void;
  setDragActive: (active: boolean) => void;
  setInternalDragActive: (active: boolean) => void;
  assignToCategory: (ids: number[], categoryId: number) => Promise<void>;
  unassignFromCategory: (ids: number[], categoryId: number) => Promise<void>;
  createCategory: (name: string) => Promise<Category | null>;
  renameCategory: (id: number, name: string) => Promise<boolean>;
  deleteCategory: (id: number) => Promise<boolean>;
  scan: () => Promise<void>;
  pendingDelete: number[] | null;
  requestDelete: (ids: number[]) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
}

export type StoreGetter = () => AppStore;
export type StoreSetter = (
  partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>),
) => void;
