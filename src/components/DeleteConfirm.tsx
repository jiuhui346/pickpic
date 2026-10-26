import { useStore } from "../store/useStore";
import { Button, Modal } from "./ui";

/** 删除确认：永久删除原文件与图库记录。 */
export function DeleteConfirm() {
  const ids = useStore((s) => s.pendingDelete);
  const cancel = useStore((s) => s.cancelDelete);
  const confirm = useStore((s) => s.confirmDelete);
  const images = useStore((s) => s.images);

  if (!ids || ids.length === 0) return null;
  const names = images
    .filter((image) => ids.includes(image.id))
    .slice(0, 3)
    .map((image) => image.fileName);

  return (
    <Modal
      title={ids.length > 1 ? `删除 ${ids.length} 张图片` : "删除图片"}
      onClose={cancel}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={cancel}>
            取消
          </Button>
          <Button variant="danger" onClick={() => void confirm()}>
            永久删除
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-6">
        将永久删除{ids.length > 1 ? `这 ${ids.length} 张图片` : "这张图片"}及其原文件，无法恢复。
      </p>
      {names.length > 0 && (
        <div className="mt-3 rounded-md bg-panel2 px-3 py-2 text-[12px] leading-5">
          {names.map((name) => (
            <div key={name} className="truncate">
              {name}
            </div>
          ))}
          {ids.length > names.length && <div className="text-muted">…等 {ids.length} 张</div>}
        </div>
      )}
    </Modal>
  );
}
