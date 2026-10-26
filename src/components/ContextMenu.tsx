import { useEffect, useRef, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/** 轻量右键菜单：点击外部或 Esc 关闭。 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const style = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - Math.min(items.length * 32 + 16, 420)),
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[210px] rounded-card border border-line bg-panel py-1 shadow-[var(--shadow)]"
      style={style}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors duration-100 hover:bg-panel2 ${
            item.danger ? "text-danger" : "text-fg"
          }`}
        >
          <span className="flex w-4 justify-center text-muted">{item.icon}</span>
          <span className="flex-1 truncate">{item.label}</span>
          {item.checked && <span className="text-accent">✓</span>}
        </button>
      ))}
    </div>
  );
}
