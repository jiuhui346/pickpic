import { useState } from "react";
import { useStore } from "../store/useStore";
import type { Category } from "../lib/types";
import { Button, Modal, TextInput } from "./ui";

interface Props {
  mode: "create" | "rename";
  category?: Category;
  onClose: () => void;
}

export function CategoryDialog({ mode, category, onClose }: Props) {
  const [name, setName] = useState(category?.name ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const store = useStore.getState();
      const ok =
        mode === "create"
          ? (await store.createCategory(value)) !== null
          : await store.renameCategory(category!.id, value);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={mode === "create" ? "新建分类" : "重命名分类"}
      onClose={onClose}
      width={380}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!name.trim() || busy}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <TextInput
        autoFocus
        value={name}
        onChange={setName}
        placeholder="分类名称"
        maxLength={40}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
      />
      <p className="mt-2 text-[11px] text-muted">分类只是逻辑标签，不会移动或复制图片文件。</p>
    </Modal>
  );
}
