import { memo, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ensureThumb, peekThumb, type ThumbInfo } from "../lib/thumbs";
import { useStore } from "../store/useStore";
import { absolutePath, formatSize } from "../lib/format";
import type { ImageMeta } from "../lib/types";
import { IconBroken } from "./icons";

interface TileProps {
  image: ImageMeta;
  tileSize: number;
  width?: number;
  height?: number;
  labelHeight: number;
  left: number;
  top: number;
  selected: boolean;
  focused: boolean;
  showMeta: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, id: number) => void;
  onContextMenu: (event: React.MouseEvent, id: number) => void;
  onOpen: (id: number) => void;
}

/** 单张缩略图卡片（虚拟滚动只挂载可视区域内的实例）。 */
export const Tile = memo(function Tile({
  image,
  tileSize,
  width,
  height,
  labelHeight,
  left,
  top,
  selected,
  focused,
  showMeta,
  onPointerDown,
  onContextMenu,
  onOpen,
}: TileProps) {
  const cached = peekThumb(image.id);
  const [info, setInfo] = useState<ThumbInfo | undefined>(cached);
  const animate = useStore((s) => s.settings.animateThumbs);
  const vault = useStore((s) => s.vault);
  const [originalFailed, setOriginalFailed] = useState(false);
  const animatable = image.ext === "gif" || image.ext === "webp";
  const originalUrl =
    animate && animatable && vault
      ? convertFileSrc(absolutePath(vault.root, image.relPath))
      : null;
  const useOriginal = Boolean(originalUrl) && !originalFailed;

  useEffect(() => {
    if (useOriginal) return;
    const known = peekThumb(image.id);
    if (known !== undefined) {
      setInfo(known);
      return;
    }
    let alive = true;
    setInfo(undefined);
    void ensureThumb(image.id).then((value) => {
      if (!alive) return;
      setInfo(value);
      // 缩略图生成成功后补齐尺寸（AVIF 等导入时拿不到宽高）
      if (value.width && value.height && (!image.width || !image.height)) {
        useStore.getState().updateImageDims(image.id, value.width, value.height);
      }
    });
    return () => {
      alive = false;
    };
  }, [image.id, image.width, image.height, useOriginal]);

  const url = useOriginal ? originalUrl : info?.url;

  const boxWidth = width ?? tileSize;
  const boxHeight = height ?? tileSize;

  const dims =
    image.width && image.height ? `${image.width}×${image.height}` : "尺寸未知";

  return (
    <div
      className="group absolute select-none"
      style={{ left, top, width: boxWidth, height: boxHeight + labelHeight }}
      onPointerDown={(event) => onPointerDown(event, image.id)}
      onContextMenu={(event) => onContextMenu(event, image.id)}
      onDoubleClick={() => onOpen(image.id)}
      data-image-id={image.id}
    >
      <div
        className={`relative overflow-hidden rounded-card border bg-panel2 transition-[border-color,box-shadow] duration-150 ${
          selected
            ? "border-accent shadow-[0_0_0_2px_var(--accent-weak)]"
            : focused
              ? "border-accent/60"
              : "border-line hover:border-muted/60"
        } ${image.missing ? "opacity-45" : ""}`}
        style={{ width: boxWidth, height: boxHeight }}
      >
        {url === undefined && (
          <div className="skeleton h-full w-full bg-[color-mix(in_srgb,var(--muted)_18%,transparent)]" />
        )}
        {url === null && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted">
            <IconBroken size={28} />
            <span className="text-[12px]">无法预览</span>
          </div>
        )}
        {url && (
          <img
            src={url}
            alt={image.fileName}
            draggable={false}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => {
              if (useOriginal) setOriginalFailed(true);
            }}
          />
        )}

        {selected && (
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-white">
            ✓
          </span>
        )}
        {image.missing && (
          <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
            缺失
          </span>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-2 pb-2 pt-7 opacity-0 transition duration-150 group-hover:translate-y-0 group-hover:opacity-100">
          <div className="truncate text-[11px] leading-4 text-white" title={image.fileName}>
            {image.fileName}
          </div>
          {showMeta && (
            <div className="truncate text-[10px] leading-4 text-white/65">
              {dims} · {formatSize(image.sizeBytes)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
