export type ImportMode = "move" | "copy";
export type ExportMode = "copy" | "move";
export type Theme = "dark" | "light" | "system";
export type ThumbSize = "small" | "medium" | "large";
export type LayoutMode = "grid" | "masonry";
export type SortField = "name" | "size" | "mtime" | "imported" | "ext";

export interface ImageMeta {
  id: number;
  relPath: string;
  fileName: string;
  baseName: string;
  ext: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  mtime: number;
  importedAt: number;
  thumbState: number;
  missing: boolean;
  categories: number[];
  tags: number[];
}

export interface McpStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  token: string;
  url: string;
  error: string | null;
}

export interface RemotePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage: string;
  files: string[];
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  error: string | null;
  path: string;
}

export interface Tag {
  id: number;
  name: string;
  imageCount: number;
}

export interface Category {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: number;
  imageCount: number;
}

export interface Settings {
  importMode: ImportMode;
  exportMode: ExportMode;
  thumbSize: ThumbSize;
  thumbPx: number;
  layoutMode: LayoutMode;
  theme: Theme;
  sortField: SortField;
  sortDesc: boolean;
  /** 快捷键绑定（JSON 字符串） */
  shortcuts: string;
  /** 简洁模式：隐藏所有小字提示 */
  hideHints: boolean;
  /** 网格中直接播放动图 */
  animateThumbs: boolean;
  globalShortcut: string;
  mcpEnabled: boolean;
  mcpPort: number;
  mcpToken: string;
  pluginRepoUrl: string;
}

export interface VaultStatus {
  configured: boolean;
  ready: boolean;
  root: string | null;
  error: string | null;
  recoveredBackup: string | null;
}

export interface VaultInfo {
  root: string;
  imageCount: number;
  totalBytes: number;
  recoveredBackup: string | null;
}

export interface RejectedFile {
  path: string;
  reason: string;
}

export interface DirCandidate {
  path: string;
  imageCount: number;
}

export interface ProbeResult {
  images: string[];
  dirs: DirCandidate[];
  rejected: RejectedFile[];
}

export interface DuplicateInfo {
  id: number;
  fileName: string;
  sizeBytes: number;
}

export interface ImportOutcome {
  image: ImageMeta;  finalName: string;
  warnings: string[];
}

export interface ThumbResult {
  state: "ready" | "broken";
  path: string | null;
  width: number | null;
  height: number | null;
}

export interface ScanReport {
  missing: number;
  orphans: string[];
}

export interface MigrateProgress {
  done: number;
  total: number;
  current: string;
}

export interface DeleteResult {
  deleted: number[];
  failed: string[];
}

export interface ExportMoveResult {
  removed: number;
  failed: string[];
}

export interface AppError {
  code: string;
  message: string;
  detail?: string | null;
}

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  detail?: string;
  sticky?: boolean;
}

export interface BannerState {
  kind: "orphans" | "info";
  message: string;
  count?: number;
  payload?: string[];
}

export interface ImportTask {
  source: string;
  defaultName: string;
}
