export type ShortcutAction =
  | "preview"
  | "toggleSelect"
  | "selectAll"
  | "delete"
  | "settings"
  | "previewPrev"
  | "previewNext";

export const SHORTCUT_META: { action: ShortcutAction; label: string; hint: string }[] = [
  { action: "preview", label: "预览选中图片", hint: "网格获得焦点时" },
  { action: "toggleSelect", label: "选中 / 取消选中", hint: "网格获得焦点时" },
  { action: "selectAll", label: "全选", hint: "当前分类内" },
  { action: "delete", label: "删除选中图片", hint: "会二次确认" },
  { action: "settings", label: "打开设置", hint: "任意界面" },
  { action: "previewPrev", label: "预览：上一张", hint: "大图预览中" },
  { action: "previewNext", label: "预览：下一张", hint: "大图预览中" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  preview: "Enter",
  toggleSelect: "Space",
  selectAll: "Ctrl+A",
  delete: "Delete",
  settings: "Ctrl+,",
  previewPrev: "ArrowLeft",
  previewNext: "ArrowRight",
};

const ACTIONS = SHORTCUT_META.map((item) => item.action);

/** 从设置里的 JSON 解析快捷键，非法或缺项回落默认值。 */
export function parseShortcuts(json: string | undefined): Record<ShortcutAction, string> {
  const result = { ...DEFAULT_SHORTCUTS };
  if (!json) return result;
  try {
    const parsed = JSON.parse(json) as Partial<Record<ShortcutAction, string>>;
    for (const action of ACTIONS) {
      const value = parsed[action];
      if (typeof value === "string" && value.trim()) result[action] = value;
    }
  } catch {
    // 配置损坏时使用默认值
  }
  return result;
}

/** 把键盘事件转成 "Ctrl+Shift+K" 这样的组合字符串。 */
export function comboFromEvent(event: KeyboardEvent): string {
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return "";
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  let key = event.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

export function matchesShortcut(event: KeyboardEvent, combo: string): boolean {
  if (!combo) return false;
  return comboFromEvent(event) === combo;
}

/** 展示用：把组合键换成更好读的中文。 */
export function formatCombo(combo: string): string {
  if (!combo) return "未设置";
  return combo
    .split("+")
    .map((part) => {
      if (part === "Space") return "空格";
      if (part === "ArrowLeft") return "←";
      if (part === "ArrowRight") return "→";
      if (part === "ArrowUp") return "↑";
      if (part === "ArrowDown") return "↓";
      if (part === "Escape") return "Esc";
      return part;
    })
    .join(" + ");
}

export function serializeShortcuts(map: Record<ShortcutAction, string>): string {
  return JSON.stringify(map);
}
