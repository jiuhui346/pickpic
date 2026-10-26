import { useState } from "react";
import { useStore } from "../store/useStore";
import { api } from "../lib/ipc";
import { Button } from "./ui";
import { IconImage } from "./icons";

/** 未入库文件提示条（一致性校验发现孤儿文件时显示）。 */
export function Banner() {
  const banner = useStore((s) => s.banner);
  const setBanner = useStore((s) => s.setBanner);
  const [busy, setBusy] = useState(false);

  if (!banner) return null;

  const importAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const files = banner.payload ?? [];
      const count = await api.importExisting(files);
      await useStore.getState().refreshImages();
      await useStore.getState().refreshCategories();
      useStore.getState().pushToast({
        kind: "success",
        message: `已导入 ${count} 个未入库的图片文件`,
      });
      setBanner(null);
    } catch (error) {
      useStore.getState().pushToast({
        kind: "error",
        message: `导入失败：${(error as { message?: string }).message ?? ""}`,
        sticky: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-[var(--accent-weak)] px-4 text-[12px]">
      <IconImage size={14} className="text-accent" />
      <span className="flex-1 truncate">{banner.message}</span>
      <Button variant="secondary" onClick={() => void importAll()} disabled={busy}>
        {busy ? "导入中…" : "导入"}
      </Button>
      <Button variant="ghost" onClick={() => setBanner(null)}>
        忽略
      </Button>
    </div>
  );
}
