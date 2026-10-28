import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import {
  comboFromEvent,
  DEFAULT_SHORTCUTS,
  formatCombo,
  parseShortcuts,
  serializeShortcuts,
  SHORTCUT_META,
  type ShortcutAction,
} from "../../lib/shortcuts";
import { SettingsSection } from "./controls";

/** 快捷键：录制、恢复默认。 */
export function ShortcutsTab() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [shortcutMap, setShortcutMap] = useState(() => parseShortcuts(settings.shortcuts));
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [recordingGlobal, setRecordingGlobal] = useState(false);

  useEffect(() => {
    setShortcutMap(parseShortcuts(settings.shortcuts));
  }, [settings.shortcuts]);

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(event);
      if (!combo) return;
      const next = { ...shortcutMap, [recording]: combo };
      setShortcutMap(next);
      setRecording(null);
      void setSettings({ shortcuts: serializeShortcuts(next) });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, shortcutMap, setSettings]);

  useEffect(() => {
    if (!recordingGlobal) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingGlobal(false);
        return;
      }
      const combo = comboFromEvent(event);
      if (!combo) return;
      if (!/(Ctrl|Alt|Meta)/.test(combo)) {
        useStore.getState().pushToast({
          kind: "error",
          message: "全局快捷键至少需要 Ctrl、Alt 或 Win 修饰键",
        });
        return;
      }
      setRecordingGlobal(false);
      void setSettings({ globalShortcut: combo });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordingGlobal, setSettings]);

  const reset = () => {
    setShortcutMap({ ...DEFAULT_SHORTCUTS });
    void setSettings({ shortcuts: serializeShortcuts(DEFAULT_SHORTCUTS) });
  };

  return (
    <SettingsSection
      title="快捷键"
      description="点击按键即可重新绑定；Esc 取消录制"
      action={
        <button className="text-[11px] text-muted hover:text-fg" onClick={reset}>
          恢复默认
        </button>
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5">
        <div className="min-w-0">
          <div className="text-[12px]">呼出主界面（全局）</div>
          <div className="hint-text text-[11px] text-muted">
            窗口隐藏到托盘后仍然有效；点击右侧按键可修改
          </div>
        </div>
        <button
          className={`h-7 min-w-[96px] shrink-0 rounded-md border px-2 text-[11px] transition-colors ${
            recordingGlobal
              ? "border-accent text-accent"
              : "border-line bg-panel2 text-fg hover:border-accent/50"
          }`}
          onClick={() => setRecordingGlobal(true)}
        >
          {recordingGlobal ? "按下按键…" : formatCombo(settings.globalShortcut)}
        </button>
      </div>
      {SHORTCUT_META.map((item) => (
        <div
          key={item.action}
          className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5 last:border-0"
        >
          <div className="min-w-0">
            <div className="text-[12px]">{item.label}</div>
            <div className="hint-text text-[11px] text-muted">{item.hint}</div>
          </div>
          <button
            className={`h-7 min-w-[96px] shrink-0 rounded-md border px-2 text-[11px] transition-colors ${
              recording === item.action
                ? "border-accent text-accent"
                : "border-line bg-panel2 text-fg hover:border-accent/50"
            }`}
            onClick={() => setRecording(item.action)}
          >
            {recording === item.action ? "按下按键…" : formatCombo(shortcutMap[item.action])}
          </button>
        </div>
      ))}
      <p className="hint-text border-t border-line/60 py-2 text-[11px] leading-4 text-muted">
        方向键的网格导航固定不可改。
      </p>
    </SettingsSection>
  );
}
