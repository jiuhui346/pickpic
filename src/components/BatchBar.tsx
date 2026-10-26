import { useState } from "react";
import { useStore } from "../store/useStore";
import { Button } from "./ui";

/** 多选后的浮动操作条：批量归类 / 取消选择。 */
export function BatchBar() {
  const selection = useStore((s) => s.selection);
  const categories = useStore((s) => s.categories);
  const clearSelection = useStore((s) => s.clearSelection);
  const assign = useStore((s) => s.assignToCategory);
  const selectAll = useStore((s) => s.selectAll);
  const requestDelete = useStore((s) => s.requestDelete);
  const openTagEditor = useStore((s) => s.openTagEditor);
  const [open, setOpen] = useState(false);

  if (selection.length === 0) return null;

  return (
    <div className="fixed bottom-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-dlg border border-line bg-panel px-4 py-2 shadow-[var(--shadow)] fade-in">
      <span className="text-[12px] text-fg">已选 {selection.length} 张</span>
      <div className="relative">
        <Button variant="secondary" onClick={() => setOpen((value) => !value)}>
          归类到 ▾
        </Button>
        {open && (
          <div className="absolute bottom-10 left-0 w-[180px] rounded-card border border-line bg-panel py-1 shadow-[var(--shadow)]">
            {categories.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-muted">还没有分类</div>
            )}
            {categories.map((category) => (
              <button
                key={category.id}
                className="block w-full truncate px-3 py-1.5 text-left text-[12px] hover:bg-panel2"
                onClick={() => {
                  setOpen(false);
                  void assign(selection, category.id);
                }}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <Button variant="secondary" onClick={() => openTagEditor(selection)}>
        标签
      </Button>
      <Button variant="secondary" onClick={selectAll}>
        全选
      </Button>
      <Button variant="danger" onClick={() => requestDelete(selection)}>
        删除
      </Button>
      <Button variant="ghost" onClick={clearSelection}>
        取消选择
      </Button>
    </div>
  );
}
