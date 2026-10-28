import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { sortImages } from "../lib/sort";
import { useGridDrag } from "../lib/useGridDrag";
import { matchesShortcut, parseShortcuts } from "../lib/shortcuts";
import type { ImageMeta } from "../lib/types";
import { Tile } from "./Tile";
import { ContextMenu } from "./ContextMenu";
import { EmptyState } from "./EmptyState";

const SIZES = {
  small: { tile: 150, label: 0, gap: 12 },
  medium: { tile: 190, label: 0, gap: 12 },
  large: { tile: 230, label: 0, gap: 14 },
} as const;

const PAD_X = 18;
const PAD_Y = 18;

interface GridProps {
  onPreview: (items: ImageMeta[], index: number) => void;
}

export function Grid({ onPreview }: GridProps) {
  const images = useStore((s) => s.images);
  const activeCat = useStore((s) => s.activeCat);
  const settings = useStore((s) => s.settings);
  const selection = useStore((s) => s.selection);
  const focusId = useStore((s) => s.focusId);
  const tagFilter = useStore((s) => s.tagFilter);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [menu, setMenu] = useState<{ x: number; y: number; id: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; count: number } | null>(null);
  const drag = useGridDrag(setGhost);

  const filtered = useMemo(() => {
    const list = images.filter((image) => {
      if (tagFilter !== null && !image.tags.includes(tagFilter)) return false;
      if (activeCat === "all") return true;
      if (activeCat === "uncat") return image.categories.length === 0;
      return image.categories.includes(activeCat);
    });
    return sortImages(list, settings.sortField, settings.sortDesc);
  }, [images, activeCat, tagFilter, settings.sortField, settings.sortDesc]);

  useEffect(() => {
    useStore.getState().setVisibleIds(filtered.map((image) => image.id));
  }, [filtered]);

  const size = SIZES[settings.thumbSize];
  const columns = Math.max(
    1,
    Math.floor((viewport.width - PAD_X * 2 + size.gap) / (size.tile + size.gap)),
  );
  const rowHeight = size.tile + size.label + size.gap;
  const rows = Math.ceil(filtered.length / columns);
  const totalHeight = rows * rowHeight + PAD_Y * 2;

  const startRow = Math.max(0, Math.floor((scrollTop - PAD_Y) / rowHeight) - 2);
  const endRow = Math.min(
    rows,
    Math.ceil((scrollTop + viewport.height - PAD_Y) / rowHeight) + 2,
  );

  const visible: { image: ImageMeta; index: number }[] = [];
  for (let row = startRow; row < endRow; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const index = row * columns + col;
      if (index >= filtered.length) break;
      visible.push({ image: filtered[index], index });
    }
  }

  useEffect(() => {
    if (!scrollEl) return;
    const update = () =>
      setViewport({ width: scrollEl.clientWidth, height: scrollEl.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);


  // Ctrl 按住拖动 = 滑动框选（经过的图片逐个切换选中状态）
  const marquee = useRef(false);
  const visited = useRef<Set<number>>(new Set());
  const clickCandidate = useRef<{
    id: number;
    x: number;
    y: number;
    wasSelected: boolean;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const candidate = clickCandidate.current;
      if (candidate && Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 5) {
        candidate.moved = true;
      }
      if (!marquee.current) return;
      const element = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-image-id]") as HTMLElement | null;
      if (!element) return;
      const id = Number(element.dataset.imageId);
      if (!Number.isFinite(id) || visited.current.has(id)) return;
      visited.current.add(id);
      useStore.getState().select(id, "toggle");
    };
    const onUp = () => {
      marquee.current = false;
      const candidate = clickCandidate.current;
      clickCandidate.current = null;
      // 单击已选中的图片 = 取消选择；拖动/双击不会走到这里取消
      if (candidate && !candidate.moved && candidate.wasSelected) {
        useStore.getState().select(candidate.id, "toggle");
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, id: number) => {
    if (event.button !== 0) return;
    const store = useStore.getState();
    if (event.ctrlKey || event.metaKey) {
      store.select(id, "toggle");
      marquee.current = true;
      visited.current = new Set([id]);
      scrollEl?.focus({ preventScroll: true });
      return;
    }
    const wasSelected = store.selection.includes(id);
    if (event.shiftKey) {
      store.select(id, "range");
    } else if (!wasSelected) {
      store.select(id, "single");
    } else {
      store.setFocus(id);
    }
    clickCandidate.current = {
      id,
      x: event.clientX,
      y: event.clientY,
      wasSelected: wasSelected && !event.shiftKey,
      moved: false,
    };
    const next = useStore.getState().selection;
    drag.begin(event, next.includes(id) ? next : [id]);
    scrollEl?.focus({ preventScroll: true });
  };

  const handleContextMenu = (event: React.MouseEvent, id: number) => {
    event.preventDefault();
    const store = useStore.getState();
    if (!store.selection.includes(id)) store.select(id, "single");
    setMenu({ x: event.clientX, y: event.clientY, id });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const store = useStore.getState();
    const ids = filtered.map((image) => image.id);
    if (ids.length === 0) return;
    const shortcuts = parseShortcuts(store.settings.shortcuts);
    const native = event.nativeEvent;
    if (matchesShortcut(native, shortcuts.selectAll)) {
      event.preventDefault();
      store.selectAll();
      return;
    }
    if (matchesShortcut(native, shortcuts.preview)) {
      event.preventDefault();
      if (focusId !== null) {
        const idx = ids.indexOf(focusId);
        if (idx >= 0) onPreview(filtered, idx);
      }
      return;
    }
    if (matchesShortcut(native, shortcuts.toggleSelect)) {
      event.preventDefault();
      if (focusId !== null) store.select(focusId, "toggle");
      return;
    }
    const currentIndex = focusId === null ? -1 : ids.indexOf(focusId);
    let nextIndex = currentIndex;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = Math.max(0, currentIndex - 1);
        break;
      case "ArrowRight":
        nextIndex = Math.min(ids.length - 1, currentIndex + 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(0, currentIndex - columns);
        break;
      case "ArrowDown":
        nextIndex = Math.min(ids.length - 1, currentIndex + columns);
        break;
      default:
        return;
    }
    if (nextIndex === -1) nextIndex = 0;
    store.select(ids[nextIndex], "single");
    scrollEl
      ?.querySelector(`[data-image-id="${ids[nextIndex]}"]`)
      ?.scrollIntoView({ block: "nearest" });
    event.preventDefault();
  };

  if (images.length === 0) {
    return <EmptyState title="把图片拖到这里开始整理" subtitle="支持 jpg / png / gif / webp / bmp / svg / avif" />;
  }

  if (filtered.length === 0) {
    return <EmptyState title="这里还没有图片" subtitle="把图片拖进来，或用右键把已有图片归入这个分类" />;
  }

  const menuImage = menu ? images.find((image) => image.id === menu.id) : null;

  return (
    <>
      <div
        ref={setScrollEl}
        tabIndex={0}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          if (event.target === event.currentTarget) useStore.getState().clearSelection();
        }}
        className="relative h-full overflow-y-auto outline-none"
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          {visible.map(({ image, index }) => (
            <Tile
              key={image.id}
              image={image}
              tileSize={size.tile}
              labelHeight={size.label}
              left={PAD_X + (index % columns) * (size.tile + size.gap)}
              top={PAD_Y + Math.floor(index / columns) * rowHeight}
              selected={selection.includes(image.id)}
              focused={focusId === image.id}
              showMeta={settings.thumbSize !== "small"}
              onPointerDown={handlePointerDown}
              onContextMenu={handleContextMenu}
              onOpen={(id) => {
                const idx = filtered.findIndex((item) => item.id === id);
                if (idx >= 0) onPreview(filtered, idx);
              }}
            />
          ))}
        </div>
      </div>

      {ghost && (
        <div
          className="pointer-events-none fixed z-[80] rounded-md border border-line bg-panel px-2.5 py-1 text-[12px] shadow-[var(--shadow)]"
          style={{ left: ghost.x, top: ghost.y }}
        >
          拖出 {ghost.count} 张
        </div>
      )}

      {menu && menuImage && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "预览",
              onClick: () => {
                const idx = filtered.findIndex((image) => image.id === menu.id);
                if (idx >= 0) onPreview(filtered, idx);
              },
            },
            ...useStore.getState().categories.map((category) => ({
              label: `归入「${category.name}」`,
              checked: menuImage.categories.includes(category.id),
              onClick: () => {
                const store = useStore.getState();
                const ids = store.selection.includes(menu.id) ? store.selection : [menu.id];
                if (menuImage.categories.includes(category.id)) {
                  void store.unassignFromCategory(ids, category.id);
                } else {
                  void store.assignToCategory(ids, category.id);
                }
              },
            })),
            {
              label: "标签…",
              onClick: () => {
                const store = useStore.getState();
                store.openTagEditor(
                  store.selection.includes(menu.id) ? store.selection : [menu.id],
                );
              },
            },
            {
              label:
                useStore.getState().selection.length > 1
                  ? `删除选中的 ${useStore.getState().selection.length} 张`
                  : "删除图片",
              danger: true,
              onClick: () => {
                const store = useStore.getState();
                store.requestDelete(
                  store.selection.includes(menu.id) ? store.selection : [menu.id],
                );
              },
            },
          ]}
        />
      )}
    </>
  );
}
