import { useEffect, useRef, useState, type ReactNode } from "react";

interface EdgePanelProps {
  side: "left" | "right";
  width: number;
  children: ReactNode;
}

/** 贴边悬停面板：鼠标移到屏幕边缘时滑出，移开后自动收回。 */
export function EdgePanel({ side, width, children }: EdgePanelProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const cancel = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
  };
  const enter = () => {
    cancel();
    setOpen(true);
  };
  const leave = () => {
    cancel();
    timer.current = window.setTimeout(() => setOpen(false), 220);
  };

  useEffect(() => () => cancel(), []);

  // 鼠标直接移出软件窗口时，panel 自身的 mouseleave 不一定触发，补全局监听
  useEffect(() => {
    if (!open) return;
    const closeNow = () => setOpen(false);
    const schedule = () => {
      cancel();
      timer.current = window.setTimeout(closeNow, 220);
    };
    const onWindowOut = (event: MouseEvent) => {
      if (!event.relatedTarget) schedule();
    };
    const onDocumentLeave = () => schedule();
    const onWindowBlur = () => closeNow();
    document.documentElement.addEventListener("mouseleave", onDocumentLeave);
    window.addEventListener("mouseout", onWindowOut);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.documentElement.removeEventListener("mouseleave", onDocumentLeave);
      window.removeEventListener("mouseout", onWindowOut);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [open]);

  const edge = side === "left" ? "left-0" : "right-0";
  const transform = open
    ? "translate-x-0"
    : side === "left"
      ? "-translate-x-full"
      : "translate-x-full";

  return (
    <>
      <div
        className={`absolute inset-y-0 ${edge} z-40 w-[6px]`}
        onMouseEnter={enter}
      />
      <div
        className={`absolute inset-y-0 ${edge} z-30 overflow-hidden border-line bg-panel shadow-[0_0_40px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out ${
          side === "left" ? "border-r" : "border-l"
        } ${transform}`}
        style={{ width }}
        onMouseEnter={enter}
        onMouseLeave={leave}
      >
        {children}
      </div>
      <div
        className={`pointer-events-none absolute inset-y-8 ${edge} z-20 w-[2px] rounded-full bg-gradient-to-b from-transparent via-accent/35 to-transparent`}
      />
    </>
  );
}
