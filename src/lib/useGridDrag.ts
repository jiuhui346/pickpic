import { useEffect, useRef } from "react";
import { startDragOut } from "./dragOut";
import { useStore } from "../store/useStore";

export interface DragGhost {
  x: number;
  y: number;
  count: number;
}

/**
 * 网格里的拖拽手势：
 * - 在窗口内松手 → 若落在左侧分类上则归类；
 * - 拖到窗口边缘/窗口外 → 交给系统拖出（CF_HDROP）。
 */
export function useGridDrag(setGhost: (ghost: DragGhost | null) => void) {
  const gesture = useRef<{
    x: number;
    y: number;
    ids: number[];
    dragged: boolean;
  } | null>(null);
  const nativeStarted = useRef(false);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current) return;
      const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
      if (!current.dragged && distance < 5) return;
      if (!current.dragged) useStore.getState().setInternalDragActive(true);
      current.dragged = true;
      setGhost({ x: event.clientX + 14, y: event.clientY + 14, count: current.ids.length });
      if (nativeStarted.current) return;
      const outside =
        event.clientX <= 16 ||
        event.clientY <= 16 ||
        event.clientX >= window.innerWidth - 16 ||
        event.clientY >= window.innerHeight - 16;
      if (outside) {
        nativeStarted.current = true;
        gesture.current = null;
        setGhost(null);
        useStore.getState().setInternalDragActive(false);
        void startDragOut(current.ids);
      }
    };

    // 鼠标拖出窗口时浏览器可能收不到 pointermove，用 pointerleave 兜底
    const onLeave = () => {
      const current = gesture.current;
      if (!current || nativeStarted.current || !current.dragged) return;
      nativeStarted.current = true;
      gesture.current = null;
      setGhost(null);
      useStore.getState().setInternalDragActive(false);
      void startDragOut(current.ids);
    };

    const onUp = (event: PointerEvent) => {
      const current = gesture.current;
      gesture.current = null;
      setGhost(null);
      useStore.getState().setInternalDragActive(false);
      if (!current?.dragged) return;
      const element = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-category-id]") as HTMLElement | null;
      if (element) {
        const categoryId = Number(element.dataset.categoryId);
        if (Number.isFinite(categoryId)) {
          void useStore.getState().assignToCategory(current.ids, categoryId);
        }
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [setGhost]);

  return {
    begin(event: React.PointerEvent, ids: number[]) {
      gesture.current = { x: event.clientX, y: event.clientY, ids, dragged: false };
      nativeStarted.current = false;
    },
  };
}
