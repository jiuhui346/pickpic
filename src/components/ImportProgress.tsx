import { useStore } from "../store/useStore";

/** 批量导入（文件夹）时的浮动进度条。 */
export function ImportProgress() {
  const importing = useStore((s) => s.importing);
  const auto = useStore((s) => s.autoImport);
  const done = useStore((s) => s.importDone);
  const total = useStore((s) => s.importTotal);
  const cancel = useStore((s) => s.cancelAllImports);

  if (!importing || !auto) return null;

  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className="fixed bottom-10 left-1/2 z-50 w-[380px] -translate-x-1/2 rounded-dlg border border-line bg-panel px-4 py-3 shadow-[var(--shadow)] fade-in">
      <div className="flex items-center justify-between text-[12px]">
        <span>正在导入 {Math.min(done + 1, total)}/{total}</span>
        <button className="text-muted hover:text-fg" onClick={cancel}>
          停止
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full bg-accent transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
