import type { ProbeResult } from "../lib/types";
import { Button, Modal } from "./ui";
import { fileNameOf } from "../lib/format";

interface Props {
  probe: ProbeResult;
  onCancel: () => void;
  onProceed: (mode: "batch" | "individual") => void;
}

/** 拖入文件夹时的确认框：批量沿用原名 / 逐个命名。 */
export function FolderPrompt({ probe, onCancel, onProceed }: Props) {
  const total = probe.dirs.reduce((sum, dir) => sum + dir.imageCount, 0);
  return (
    <Modal
      title="导入文件夹"
      onClose={onCancel}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button variant="secondary" onClick={() => onProceed("individual")} disabled={total === 0}>
            逐个命名
          </Button>
          <Button variant="primary" onClick={() => onProceed("batch")} disabled={total === 0}>
            批量导入
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-6">
        将递归导入文件夹中的 <span className="font-medium text-fg">{total}</span> 张图片（只取图片文件）。
      </p>
      <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-md bg-panel2 p-2 text-[12px]">
        {probe.dirs.map((dir) => (
          <div key={dir.path} className="flex items-center justify-between gap-3 px-1 py-0.5">
            <span className="truncate" title={dir.path}>
              {fileNameOf(dir.path)}
            </span>
            <span className="shrink-0 text-muted">{dir.imageCount} 张</span>
          </div>
        ))}
      </div>
      <p className="hint-text mt-3 text-[11px] leading-5 text-muted">
        「批量导入」沿用原文件名，重名时自动加序号；「逐个命名」会为每张图弹出命名框。
      </p>
    </Modal>
  );
}
