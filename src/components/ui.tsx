import type { ReactNode } from "react";
import { useEffect } from "react";
import { IconClose } from "./icons";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  width?: number;
  footer?: ReactNode;
}

/** 通用弹窗：Esc 关闭、点击遮罩关闭、锁定背景滚动。 */
export function Modal({ title, children, onClose, width = 420, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onClose) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onClose) onClose();
      }}
    >
      <div
        className="rounded-dlg border border-line bg-panel shadow-[var(--shadow)]"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex h-12 items-center justify-between border-b border-line px-4">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {onClose && (
            <button
              className="rounded-md p-1.5 text-muted hover:bg-panel2 hover:text-fg"
              onClick={onClose}
              aria-label="关闭"
            >
              <IconClose size={16} />
            </button>
          )}
        </header>
        <div className="px-4 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "border border-line bg-panel2 text-fg hover:border-accent/60",
    ghost: "text-muted hover:bg-panel2 hover:text-fg",
    danger: "bg-danger text-white hover:opacity-90",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`h-8 rounded-md px-3 text-[13px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  onKeyDown,
  inputRef,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  maxLength?: number;
}) {
  return (
    <input
      ref={inputRef}
      autoFocus={autoFocus}
      value={value}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className="h-9 w-full rounded-md border border-line bg-panel2 px-3 text-[13px] outline-none transition-colors duration-150 focus:border-accent"
    />
  );
}
