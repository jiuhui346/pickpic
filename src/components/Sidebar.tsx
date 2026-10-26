import { useState } from "react";
import { useStore } from "../store/useStore";
import type { Category } from "../lib/types";
import { IconEdit, IconPlus, IconTrash } from "./icons";
import { ContextMenu } from "./ContextMenu";
import { CategoryDialog } from "./CategoryDialog";

export function Sidebar() {
  const images = useStore((s) => s.images);
  const categories = useStore((s) => s.categories);
  const activeCat = useStore((s) => s.activeCat);
  const setActiveCat = useStore((s) => s.setActiveCat);
  const vault = useStore((s) => s.vault);
  const internalDrag = useStore((s) => s.internalDragActive);

  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "rename"; category: Category } | null
  >(null);
  const [menu, setMenu] = useState<{ x: number; y: number; category: Category } | null>(null);

  const uncategorized = images.filter((image) => image.categories.length === 0).length;

  const itemClass = (active: boolean) =>
    `group flex w-full items-center gap-2 rounded-md px-3 h-9 text-[13px] transition-colors duration-150 ${
      active
        ? "bg-[var(--accent-weak)] text-accent"
        : "text-fg hover:bg-panel2"
    } ${internalDrag ? "ring-1 ring-transparent hover:ring-accent/50" : ""}`;

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[12px] font-semibold text-white">
          图
        </span>
        <span className="text-[14px] font-semibold">拾图</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <button className={itemClass(activeCat === "all")} onClick={() => setActiveCat("all")}>
          <span className="flex-1 text-left">全部图片</span>
          <span className="text-[11px] text-muted">{images.length}</span>
        </button>
        <button
          className={itemClass(activeCat === "uncat")}
          onClick={() => setActiveCat("uncat")}
        >
          <span className="flex-1 text-left">未分类</span>
          <span className="text-[11px] text-muted">{uncategorized}</span>
        </button>

        <div className="my-2 border-t border-line" />

        {categories.length === 0 && (
          <div className="px-3 py-2 text-[12px] leading-5 text-muted">
            还没有分类。新建一个分类，再把图片拖进来。
          </div>
        )}

        {categories.map((category) => (
          <button
            key={category.id}
            data-category-id={category.id}
            className={itemClass(activeCat === category.id)}
            onClick={() => setActiveCat(category.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, category });
            }}
          >
            <span className="flex-1 truncate text-left">{category.name}</span>
            <span className="text-[11px] text-muted">{category.imageCount}</span>
          </button>
        ))}

        <button
          className="mt-2 flex h-9 w-full items-center gap-2 rounded-md px-3 text-[13px] text-muted transition-colors duration-150 hover:bg-panel2 hover:text-fg"
          onClick={() => setDialog({ mode: "create" })}
        >
          <IconPlus size={14} />
          新建分类
        </button>
      </nav>

      <div className="shrink-0 border-t border-line px-3 py-2">
        <div className="truncate text-[11px] text-muted" title={vault?.root ?? ""}>
          {vault?.root ?? ""}
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "新建分类",
              icon: <IconPlus size={14} />,
              onClick: () => setDialog({ mode: "create" }),
            },
            {
              label: "重命名",
              icon: <IconEdit size={14} />,
              onClick: () => setDialog({ mode: "rename", category: menu.category }),
            },
            {
              label: "删除分类",
              icon: <IconTrash size={14} />,
              danger: true,
              onClick: () => {
                const count = menu.category.imageCount;
                if (
                  window.confirm(
                    `删除分类「${menu.category.name}」？\n\n该分类下的 ${count} 张图片不会被删除，只会解除关联。`,
                  )
                ) {
                  void useStore.getState().deleteCategory(menu.category.id);
                }
              },
            },
          ]}
        />
      )}

      {dialog && (
        <CategoryDialog
          mode={dialog.mode}
          category={dialog.mode === "rename" ? dialog.category : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </aside>
  );
}
