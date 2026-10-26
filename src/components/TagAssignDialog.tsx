import { useState } from "react";
import { useStore } from "../store/useStore";
import { Button, Modal } from "./ui";
import { IconCheck, IconPlus } from "./icons";

/** 给已有图片打标签 / 取消标签（批量）。 */
export function TagAssignDialog() {
  const ids = useStore((s) => s.tagEditor);
  const close = useStore((s) => s.closeTagEditor);
  const tags = useStore((s) => s.tags);
  const images = useStore((s) => s.images);
  const assignTag = useStore((s) => s.assignTag);
  const unassignTag = useStore((s) => s.unassignTag);
  const createTag = useStore((s) => s.createTag);

  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ids || ids.length === 0) return null;
  const target = images.filter((image) => ids.includes(image.id));
  const selected = new Set(target.flatMap((image) => image.tags));

  const toggle = async (tagId: number) => {
    if (busy) return;
    setBusy(true);
    try {
      if (selected.has(tagId)) {
        await unassignTag(ids, tagId);
      } else {
        await assignTag(ids, tagId);
      }
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = newTag.trim();
    if (!name) return;
    const tag = await createTag(name);
    if (tag) {
      setNewTag("");
      await assignTag(ids, tag.id);
    }
  };

  return (
    <Modal
      title={ids.length > 1 ? `给 ${ids.length} 张图片加标签` : "图片标签"}
      onClose={close}
      width={420}
      footer={
        <Button variant="primary" onClick={close}>
          完成
        </Button>
      }
    >
      <div className="max-h-[260px] space-y-1 overflow-y-auto">
        {tags.length === 0 && (
          <p className="py-2 text-[12px] text-muted">还没有标签，在下面创建一个。</p>
        )}
        {tags.map((tag) => (
          <button
            key={tag.id}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] hover:bg-panel2"
            onClick={() => void toggle(tag.id)}
          >
            <span className="truncate">{tag.name}</span>
            {selected.has(tag.id) ? (
              <IconCheck size={15} className="text-accent" />
            ) : (
              <span className="text-[11px] text-muted">{tag.imageCount}</span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2 border-t border-line pt-3">
        <input
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
          }}
          placeholder="新建标签"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel2 px-2 text-[12px] outline-none focus:border-accent"
        />
        <Button variant="secondary" onClick={() => void create()} disabled={!newTag.trim()}>
          <span className="flex items-center gap-1">
            <IconPlus size={13} />
            创建并添加
          </span>
        </Button>
      </div>
      <p className="hint-text mt-2 text-[11px] leading-4 text-muted">
        标签用于顶部筛选，不会改变图片所在的分类。
      </p>
    </Modal>
  );
}
