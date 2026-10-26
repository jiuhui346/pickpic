import { useStore } from "../store/useStore";
import { formatSize } from "../lib/format";
import { Button, Modal } from "./ui";

/** 导入前发现内容完全相同的图片时的询问框（出现在命名框之前）。 */
export function DuplicateDialog() {
  const prompt = useStore((s) => s.duplicatePrompt);
  const resolve = useStore((s) => s.resolveDuplicate);

  if (!prompt) return null;

  return (
    <Modal
      title="发现重复图片"
      width={460}
      onClose={() => void resolve(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => void resolve(false)}>
            跳过重复（推荐）
          </Button>
          <Button variant="primary" onClick={() => void resolve(true)}>
            仍然添加
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-6">图库中已经存在内容完全相同的图片：</p>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-panel2 px-3 py-2 text-[12px]">
        <span className="min-w-0 truncate" title={prompt.existing.fileName}>
          {prompt.existing.fileName}
        </span>
        <span className="shrink-0 text-muted">{formatSize(prompt.existing.sizeBytes)}</span>
      </div>
      <p className="hint-text mt-3 text-[11px] leading-5 text-muted">
        继续添加会保留两份文件；跳过则本次不导入这张，原文件保持在原位置。
      </p>
    </Modal>
  );
}
