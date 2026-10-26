import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import type { SortField, ThumbSize } from "../lib/types";
import { IconArrowDown, IconArrowUp, IconCheck, IconGear } from "./icons";

const SORT_LABELS: { field: SortField; label: string }[] = [
  { field: "name", label: "文件名" },
  { field: "size", label: "文件大小" },
  { field: "mtime", label: "修改时间" },
  { field: "imported", label: "导入时间" },
  { field: "ext", label: "图片类型" },
];

const SIZE_OPTIONS: { value: ThumbSize; label: string }[] = [
  { value: "small", label: "小" },
  { value: "medium", label: "中" },
  { value: "large", label: "大" },
];

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const tags = useStore((s) => s.tags);
  const tagFilter = useStore((s) => s.tagFilter);
  const setTagFilter = useStore((s) => s.setTagFilter);
  const pluginButtons = useStore((s) => s.pluginButtons);
  const [open, setOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const currentLabel =
    SORT_LABELS.find((item) => item.field === settings.sortField)?.label ?? "导入时间";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-4">
      <div className="relative" ref={menuRef}>
        <button
          className="flex h-8 items-center gap-2 rounded-md border border-line bg-panel2 px-3 text-[12px] transition-colors duration-150 hover:border-accent/50"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="text-muted">排序</span>
          <span>{currentLabel}</span>
          <span className="text-muted">▾</span>
        </button>
        {open && (
          <div className="absolute left-0 top-9 z-30 w-[180px] rounded-card border border-line bg-panel py-1 shadow-[var(--shadow)] fade-in">
            {SORT_LABELS.map((item) => (
              <button
                key={item.field}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-panel2"
                onClick={() => {
                  setOpen(false);
                  if (item.field !== settings.sortField) {
                    void setSettings({ sortField: item.field, sortDesc: item.field === "imported" });
                  }
                }}
              >
                <span>{item.label}</span>
                {settings.sortField === item.field && <IconCheck size={13} className="text-accent" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel2 text-muted transition-colors duration-150 hover:border-accent/50 hover:text-fg"
        title={settings.sortDesc ? "当前降序，点击切换升序" : "当前升序，点击切换降序"}
        onClick={() => void setSettings({ sortDesc: !settings.sortDesc })}
      >
        {settings.sortDesc ? <IconArrowDown size={14} /> : <IconArrowUp size={14} />}
      </button>

      <div className="relative">
        <button
          className="flex h-8 items-center gap-2 rounded-md border border-line bg-panel2 px-3 text-[12px] transition-colors duration-150 hover:border-accent/50"
          onClick={() => setTagOpen((value) => !value)}
          title="按标签筛选当前分类"
        >
          <span className="text-muted">标签</span>
          <span className="max-w-[110px] truncate">
            {tags.find((tag) => tag.id === tagFilter)?.name ?? "不筛选"}
          </span>
          <span className="text-muted">▾</span>
        </button>
        {tagOpen && (
          <div className="absolute left-0 top-9 z-30 max-h-[260px] w-[190px] overflow-y-auto rounded-card border border-line bg-panel py-1 shadow-[var(--shadow)] fade-in">
            <button
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-panel2"
              onClick={() => {
                setTagFilter(null);
                setTagOpen(false);
              }}
            >
              不筛选
              {tagFilter === null && <IconCheck size={13} className="text-accent" />}
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-panel2"
                onClick={() => {
                  setTagFilter(tag.id);
                  setTagOpen(false);
                }}
              >
                <span className="truncate">{tag.name}</span>
                {tagFilter === tag.id && <IconCheck size={13} className="text-accent" />}
              </button>
            ))}
            {tags.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-muted">还没有标签（可在右键菜单里添加）</div>
            )}
          </div>
        )}
      </div>

      <div className="mx-2 h-5 w-px bg-line" />

      <span className="text-[12px] text-muted">缩略图</span>
      <div className="flex overflow-hidden rounded-md border border-line">
        {SIZE_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={`h-8 w-9 text-[12px] transition-colors duration-150 ${
              settings.thumbSize === option.value
                ? "bg-[var(--accent-weak)] text-accent"
                : "bg-panel2 text-muted hover:text-fg"
            }`}
            onClick={() => void setSettings({ thumbSize: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {pluginButtons.map((button) => (
        <button
          key={button.id}
          className="flex h-8 items-center gap-2 rounded-md border border-line bg-panel2 px-3 text-[12px] transition-colors duration-150 hover:border-accent/50"
          onClick={button.onClick}
        >
          {button.label}
        </button>
      ))}

      <button
        className="flex h-8 items-center gap-2 rounded-md border border-line bg-panel2 px-3 text-[12px] text-muted transition-colors duration-150 hover:border-accent/50 hover:text-fg"
        onClick={onOpenSettings}
      >
        <IconGear size={14} />
        设置
      </button>
    </header>
  );
}
