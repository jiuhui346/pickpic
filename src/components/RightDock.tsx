import { useState } from "react";
import { useStore } from "../store/useStore";
import { formatSize } from "../lib/format";
import type { SortField } from "../lib/types";
import { IconArrowDown, IconArrowUp, IconCheck, IconGear } from "./icons";
import { Button } from "./ui";

const SORT_LABELS: { field: SortField; label: string }[] = [
  { field: "name", label: "文件名" },
  { field: "size", label: "文件大小" },
  { field: "mtime", label: "修改时间" },
  { field: "imported", label: "导入时间" },
  { field: "ext", label: "图片类型" },
];

/** 右侧贴边面板：排序、标签筛选、插件与设置入口。 */
export function RightDock({ onOpenSettings }: { onOpenSettings: () => void }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const tags = useStore((s) => s.tags);
  const tagFilter = useStore((s) => s.tagFilter);
  const setTagFilter = useStore((s) => s.setTagFilter);
  const images = useStore((s) => s.images);
  const categories = useStore((s) => s.categories);
  const activeCat = useStore((s) => s.activeCat);
  const selection = useStore((s) => s.selection);
  const pluginButtons = useStore((s) => s.pluginButtons);

  const [sortOpen, setSortOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  const filtered = images.filter((image) => {
    if (tagFilter !== null && !image.tags.includes(tagFilter)) return false;
    if (activeCat === "all") return true;
    if (activeCat === "uncat") return image.categories.length === 0;
    return image.categories.includes(activeCat);
  });
  const totalBytes = filtered.reduce((sum, image) => sum + image.sizeBytes, 0);
  const categoryName =
    typeof activeCat === "number"
      ? categories.find((category) => category.id === activeCat)?.name ?? "分类"
      : activeCat === "uncat"
        ? "未分类"
        : "全部图片";
  const sortLabel =
    SORT_LABELS.find((item) => item.field === settings.sortField)?.label ?? "导入时间";
  const tagLabel = tags.find((tag) => tag.id === tagFilter)?.name ?? "不筛选";

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-5 pb-4 pt-5">
        <div className="text-[15px] font-semibold">视图</div>
        <div className="hint-text mt-1 text-[11px] text-muted">筛选、排序与显示</div>
        <div className="hint-text mt-1 text-[10px] text-muted">Ctrl + 滚轮调整缩略图大小</div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        <section>
          <button
            className="flex h-9 w-full items-center justify-between rounded-md border border-line bg-panel2 px-3 text-[12px] transition-colors hover:border-accent/40"
            onClick={() => {
              setSortOpen((open) => !open);
              setTagOpen(false);
            }}
          >
            <span className="text-muted">排序</span>
            <span className="flex items-center gap-1.5">
              {sortLabel}
              <span className="text-[10px] text-muted">{sortOpen ? "▴" : "▾"}</span>
            </span>
          </button>
          {sortOpen && (
            <div className="mt-1.5 rounded-md border border-line bg-panel2/60 p-1">
              {SORT_LABELS.map((item) => (
                <button
                  key={item.field}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-[12px] ${
                    settings.sortField === item.field
                      ? "bg-[var(--accent-weak)] text-accent"
                      : "hover:bg-panel2"
                  }`}
                  onClick={() => {
                    setSortOpen(false);
                    if (item.field !== settings.sortField) {
                      void setSettings({
                        sortField: item.field,
                        sortDesc: item.field === "imported",
                      });
                    }
                  }}
                >
                  {item.label}
                  {settings.sortField === item.field && <IconCheck size={12} />}
                </button>
              ))}
            </div>
          )}
          <button
            className="mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-panel2 text-[11px] text-muted hover:border-accent/40 hover:text-fg"
            onClick={() => void setSettings({ sortDesc: !settings.sortDesc })}
          >
            {settings.sortDesc ? <IconArrowDown size={13} /> : <IconArrowUp size={13} />}
            {settings.sortDesc ? "当前降序" : "当前升序"}
          </button>
        </section>

        <section>
          <button
            className="flex h-9 w-full items-center justify-between rounded-md border border-line bg-panel2 px-3 text-[12px] transition-colors hover:border-accent/40"
            onClick={() => {
              setTagOpen((open) => !open);
              setSortOpen(false);
            }}
          >
            <span className="text-muted">标签筛选</span>
            <span className="flex items-center gap-1.5">
              <span className="max-w-[120px] truncate">{tagLabel}</span>
              <span className="text-[10px] text-muted">{tagOpen ? "▴" : "▾"}</span>
            </span>
          </button>
          {tagOpen && (
            <div className="mt-1.5 max-h-[240px] overflow-y-auto rounded-md border border-line bg-panel2/60 p-1">
              <button
                className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-[12px] ${
                  tagFilter === null ? "bg-[var(--accent-weak)] text-accent" : "hover:bg-panel2"
                }`}
                onClick={() => {
                  setTagFilter(null);
                  setTagOpen(false);
                }}
              >
                不筛选
                {tagFilter === null && <IconCheck size={12} />}
              </button>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-[12px] ${
                    tagFilter === tag.id ? "bg-[var(--accent-weak)] text-accent" : "hover:bg-panel2"
                  }`}
                  onClick={() => {
                    setTagFilter(tag.id);
                    setTagOpen(false);
                  }}
                >
                  <span className="truncate">{tag.name}</span>
                  {tagFilter === tag.id && <IconCheck size={12} />}
                </button>
              ))}
              {tags.length === 0 && (
                <div className="px-2.5 py-2 text-[11px] text-muted">还没有标签，可在右键菜单添加</div>
              )}
            </div>
          )}
        </section>

        {pluginButtons.length > 0 && (
          <section>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">插件</div>
            <div className="space-y-1.5">
              {pluginButtons.map((button) => (
                <button
                  key={button.id}
                  className="flex h-8 w-full items-center rounded-md border border-line bg-panel2 px-2.5 text-left text-[12px] hover:border-accent/40"
                  onClick={button.onClick}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="space-y-2 border-t border-line p-3">
        <Button variant="primary" className="w-full" onClick={onOpenSettings}>
          <span className="flex items-center justify-center gap-1.5">
            <IconGear size={14} />
            设置
          </span>
        </Button>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="truncate">
            {categoryName} · {filtered.length} 张
          </span>
          <span className="shrink-0">{formatSize(totalBytes)}</span>
        </div>
        {selection.length > 0 && (
          <div className="text-[11px] text-accent">已选 {selection.length} 张</div>
        )}
      </footer>
    </div>
  );
}
