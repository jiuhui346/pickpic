/** 字节数 → 1.2 MB */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return index === 0 ? `${bytes} B` : `${value.toFixed(1)} ${units[index]}`;
}

/** Unix 秒 → 2026-10-26 14:30 */
export function formatTime(seconds: number): string {
  if (!seconds) return "—";
  const date = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** 从完整路径取文件名（含扩展名） */
export function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** 从完整路径取主名（不含扩展名） */
export function baseNameOf(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** 存储根 + 相对路径 → 绝对路径（Windows 分隔符） */
export function absolutePath(root: string, relPath: string): string {
  const normalizedRoot = root.endsWith("\\") || root.endsWith("/") ? root.slice(0, -1) : root;
  return `${normalizedRoot}\\${relPath.replace(/\//g, "\\")}`;
}
