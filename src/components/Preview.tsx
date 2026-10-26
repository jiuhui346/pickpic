import { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useStore } from "../store/useStore";
import type { ImageMeta } from "../lib/types";
import { absolutePath, formatSize } from "../lib/format";
import { matchesShortcut, parseShortcuts } from "../lib/shortcuts";
import { IconChevronLeft, IconChevronRight, IconClose } from "./icons";

interface Props {
  items: ImageMeta[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** 大图预览：Esc 关闭，左右键切换。 */
export function Preview({ items, index, onIndexChange, onClose }: Props) {
  const vault = useStore((s) => s.vault);
  const image = items[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcuts = parseShortcuts(useStore.getState().settings.shortcuts);
      if (event.key === "Escape") onClose();
      if (matchesShortcut(event, shortcuts.previewPrev)) {
        onIndexChange(Math.max(0, index - 1));
      }
      if (matchesShortcut(event, shortcuts.previewNext)) {
        onIndexChange(Math.min(items.length - 1, index + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onIndexChange, onClose]);

  if (!image || !vault) return null;
  const source = convertFileSrc(absolutePath(vault.root, image.relPath));

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-black/85 fade-in" onClick={onClose}>
      <div className="flex h-12 shrink-0 items-center justify-between px-4 text-white/85">
        <div className="min-w-0 truncate text-[13px]" onClick={(event) => event.stopPropagation()}>
          {image.fileName}
          <span className="ml-3 text-white/50">
            {image.width && image.height ? `${image.width}×${image.height} · ` : ""}
            {formatSize(image.sizeBytes)} · {index + 1}/{items.length}
          </span>
        </div>
        <button className="rounded p-1.5 hover:bg-white/10" onClick={onClose} aria-label="关闭预览">
          <IconClose size={18} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        {index > 0 && (
          <button
            className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60"
            onClick={(event) => {
              event.stopPropagation();
              onIndexChange(index - 1);
            }}
            aria-label="上一张"
          >
            <IconChevronLeft size={20} />
          </button>
        )}
        <img
          src={source}
          alt={image.fileName}
          className="max-h-full max-w-full object-contain"
          onClick={(event) => event.stopPropagation()}
        />
        {index < items.length - 1 && (
          <button
            className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60"
            onClick={(event) => {
              event.stopPropagation();
              onIndexChange(index + 1);
            }}
            aria-label="下一张"
          >
            <IconChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
