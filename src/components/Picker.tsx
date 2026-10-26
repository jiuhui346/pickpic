import { useState } from "react";
import { Button } from "./ui";

export interface PickerItem {
  id: number;
  name: string;
}

interface PickerProps {
  label: string;
  emptyLabel: string;
  items: PickerItem[];
  value: number | null;
  onChange: (id: number | null) => void;
  createLabel?: string;
  onCreate?: (name: string) => Promise<PickerItem | null>;
  hint?: string;
}

/** 命名弹窗里的小型下拉选择器：可选空值、已有项、以及内联新建。 */
export function Picker({
  label,
  emptyLabel,
  items,
  value,
  onChange,
  createLabel,
  onCreate,
  hint,
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = items.find((item) => item.id === value)?.name ?? emptyLabel;

  const create = async () => {
    const name = (newName ?? "").trim();
    if (!name || !onCreate || busy) return;
    setBusy(true);
    try {
      const created = await onCreate(name);
      if (created) {
        onChange(created.id);
        setNewName(null);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <div className="relative">
        <button
          className="flex h-8 min-w-[170px] items-center justify-between gap-2 rounded-md border border-line bg-panel2 px-3 text-[12px] hover:border-accent/50"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="truncate">{current}</span>
          <span className="text-muted">▾</span>
        </button>
        {open && (
          <div className="absolute right-0 top-9 z-20 max-h-[220px] w-[230px] overflow-y-auto rounded-card border border-line bg-panel py-1 shadow-[var(--shadow)]">
            <button
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-panel2"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              {emptyLabel}
              {value === null && <span className="text-accent">✓</span>}
            </button>
            {items.map((item) => (
              <button
                key={item.id}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-panel2"
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
              >
                <span className="truncate">{item.name}</span>
                {value === item.id && <span className="text-accent">✓</span>}
              </button>
            ))}
            {onCreate && createLabel && (
              <>
                <div className="my-1 border-t border-line" />
                {newName === null ? (
                  <button
                    className="w-full px-3 py-1.5 text-left text-[12px] text-accent hover:bg-panel2"
                    onClick={() => setNewName("")}
                  >
                    {createLabel}
                  </button>
                ) : (
                  <div className="flex gap-1 px-2 py-1.5">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void create();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setNewName(null);
                        }
                      }}
                      placeholder="名称"
                      className="h-7 min-w-0 flex-1 rounded border border-line bg-panel2 px-2 text-[12px] outline-none focus:border-accent"
                    />
                    <Button variant="primary" onClick={() => void create()} disabled={busy}>
                      创建
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {hint && <span className="hidden">{hint}</span>}
    </div>
  );
}
