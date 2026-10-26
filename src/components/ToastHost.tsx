import { useStore } from "../store/useStore";
import { IconClose } from "./icons";

export function ToastHost() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-9 right-4 z-[60] flex w-[360px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-card border px-3 py-2 shadow-[var(--shadow)] fade-in ${
            toast.kind === "error"
              ? "border-danger/40 bg-panel"
              : toast.kind === "success"
                ? "border-accent/40 bg-panel"
                : "border-line bg-panel"
          }`}
        >
          <div className="flex items-start gap-2">
            <span
              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                toast.kind === "error"
                  ? "bg-danger"
                  : toast.kind === "success"
                    ? "bg-accent"
                    : "bg-muted"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] leading-5">{toast.message}</div>
              {toast.detail && (
                <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-muted">
                  {toast.detail}
                </div>
              )}
            </div>
            <button
              className="rounded p-0.5 text-muted hover:text-fg"
              onClick={() => dismiss(toast.id)}
              aria-label="关闭提示"
            >
              <IconClose size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
