import { IconImage } from "./icons";

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-[440px] flex-col items-center rounded-dlg border border-dashed border-line px-8 py-14 text-center">
        <IconImage size={40} className="text-muted" />
        <div className="mt-4 text-[15px] font-medium">{title}</div>
        {subtitle && <div className="hint-text mt-2 text-[12px] leading-5 text-muted">{subtitle}</div>}
      </div>
    </div>
  );
}
