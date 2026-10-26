import type React from "react";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-line">
      {options.map((option) => (
        <button
          key={option.value}
          className={`h-8 px-3 text-[12px] transition-colors duration-150 ${
            value === option.value
              ? "bg-[var(--accent-weak)] text-accent"
              : "bg-panel2 text-muted hover:text-fg"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="hint-text mt-0.5 break-all text-[11px] leading-4 text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {description && <p className="hint-text mt-0.5 text-[11px] text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-2 rounded-lg border border-line bg-panel/40 px-4">{children}</div>
    </section>
  );
}
