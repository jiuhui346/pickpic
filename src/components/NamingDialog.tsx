import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { Button, Modal, TextInput } from "./ui";
import { Picker } from "./Picker";
import { fileNameOf } from "../lib/format";
import { api } from "../lib/ipc";

function sanitizePreview(name: string, fallback: string): string {
  let value = name.trim();
  if (!value) value = fallback;
  value = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  value = value.replace(/[. ]+$/g, "");
  return value || "未命名";
}

/** 队列式命名弹窗：分类 + 标签 + 名称，回车确认、Esc 跳过。 */
export function NamingDialog() {
  const task = useStore((s) => s.pendingImport[0]);
  const total = useStore((s) => s.importTotal);
  const done = useStore((s) => s.importDone);
  const auto = useStore((s) => s.autoImport);
  const importing = useStore((s) => s.importing);
  const mode = useStore((s) => s.settings.importMode);
  const categories = useStore((s) => s.categories);
  const tags = useStore((s) => s.tags);
  const lastTagId = useStore((s) => s.lastTagId);
  const activeCat = useStore((s) => s.activeCat);
  const duplicate = useStore((s) => s.duplicatePrompt);
  const confirmName = useStore((s) => s.confirmName);
  const skipCurrent = useStore((s) => s.skipCurrent);
  const cancelAll = useStore((s) => s.cancelAllImports);
  const createCategory = useStore((s) => s.createCategory);
  const createTag = useStore((s) => s.createTag);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tagId, setTagId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!task) return;
    let alive = true;
    setPreviewUrl(null);
    setPreviewError(false);
    void api
      .sourcePreview(task.source)
      .then((url) => {
        if (alive) setPreviewUrl(url);
      })
      .catch(() => {
        if (alive) setPreviewError(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.source]);

  useEffect(() => {
    if (!task) return;
    setName(task.defaultName);
    setBusy(false);
    // 分类：在某个分类页拖入时默认该分类；全部图片 / 未分类页默认未分类
    setCategoryId(
      typeof activeCat === "number" && categories.some((c) => c.id === activeCat)
        ? activeCat
        : null,
    );
    // 标签：默认上一次使用的标签
    setTagId(lastTagId && tags.some((t) => t.id === lastTagId) ? lastTagId : null);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(timer);
    // 只在切换到下一张时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.source]);

  if (!task || !importing || auto || duplicate) return null;

  const ext = fileNameOf(task.source).split(".").pop() ?? "";
  const tagName = tags.find((tag) => tag.id === tagId)?.name ?? null;
  const base = sanitizePreview(name, task.defaultName);
  const preview = `${tagName ? `${tagName}_` : ""}${base}.${ext}`;
  const needsClean = base !== name.trim();

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await confirmName(tagName ? `${tagName}_${name}` : name, { tagId, categoryId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`第 ${Math.min(done + 1, total)}/${total} 个 · 命名`}
      onClose={() => skipCurrent()}
      width={470}
      footer={
        <>
          <Button variant="ghost" onClick={cancelAll}>
            全部取消
          </Button>
          <Button variant="secondary" onClick={skipCurrent}>
            跳过
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "处理中…" : "确认 (Enter)"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="min-w-0 text-[12px] text-muted">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">来源：</span>
            <span className="min-w-0 truncate" title={task.source}>
              {fileNameOf(task.source)}
            </span>
          </div>
          <div className="hint-text mt-1">
            {mode === "move" ? "导入后原文件将被移动" : "导入后原文件保留"}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-md border border-line bg-panel2">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={fileNameOf(task.source)}
              className="max-h-[220px] w-full object-contain"
            />
          ) : (
            <div className="flex h-[150px] items-center justify-center text-[11px] text-muted">
              {previewError ? "无法预览这张图片" : "正在加载预览…"}
            </div>
          )}
        </div>

        <Picker
          label="分类"
          emptyLabel="未分类"
          items={categories}
          value={categoryId}
          onChange={setCategoryId}
          createLabel="＋ 新建分类…"
          onCreate={createCategory}
        />

        <Picker
          label="标签"
          emptyLabel="不添加标签"
          items={tags}
          value={tagId}
          onChange={setTagId}
          createLabel="＋ 新建标签…"
          onCreate={createTag}
        />

        <TextInput
          inputRef={inputRef}
          autoFocus
          value={name}
          onChange={setName}
          placeholder="给这张图片起个名字"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              skipCurrent();
            }
          }}
        />

        <div className="rounded-md bg-panel2 px-3 py-2 text-[12px]">
          <div className="hint-text text-muted">将保存为</div>
          <div className="mt-1 break-all text-fg">{preview}</div>
          {needsClean && (
            <div className="hint-text mt-1 text-[11px] text-muted">
              Windows 非法字符会替换为下划线，末尾的空格/句点会被去掉
            </div>
          )}
        </div>

        <p className="hint-text text-[11px] leading-4 text-muted">
          标签用于在分类里筛选图片；推荐添加标签，方便以后查找。
        </p>
      </div>
    </Modal>
  );
}
