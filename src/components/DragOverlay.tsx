import { useStore } from "../store/useStore";

/** 拖入时的全窗口高亮反馈。 */
export function DragOverlay() {
  const active = useStore((s) => s.dragActive);
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-accent/5">
      <div className="absolute inset-3 rounded-dlg border-2 border-dashed border-accent" />
      <div className="rounded-dlg border border-accent/40 bg-panel px-6 py-4 text-center shadow-[var(--shadow)]">
        <div className="text-[15px] font-medium">松手导入到图库</div>
        <div className="mt-1 text-[12px] text-muted">支持 jpg / png / gif / webp / bmp / svg / avif</div>
      </div>
    </div>
  );
}
