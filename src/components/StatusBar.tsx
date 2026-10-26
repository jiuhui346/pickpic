import { useStore } from "../store/useStore";
import { formatSize } from "../lib/format";

export function StatusBar() {
  const images = useStore((s) => s.images);
  const activeCat = useStore((s) => s.activeCat);
  const selection = useStore((s) => s.selection);
  const categories = useStore((s) => s.categories);

  const filtered = images.filter((image) => {
    if (activeCat === "all") return true;
    if (activeCat === "uncat") return image.categories.length === 0;
    return image.categories.includes(activeCat);
  });
  const totalBytes = filtered.reduce((sum, image) => sum + image.sizeBytes, 0);
  const selectedBytes = images
    .filter((image) => selection.includes(image.id))
    .reduce((sum, image) => sum + image.sizeBytes, 0);
  const categoryName =
    typeof activeCat === "number"
      ? categories.find((category) => category.id === activeCat)?.name ?? "分类"
      : activeCat === "uncat"
        ? "未分类"
        : "全部图片";

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-panel px-4 text-[11px] text-muted">
      <span>
        {categoryName} · 共 {filtered.length} 张 · {formatSize(totalBytes)}
      </span>
      <span>
        {selection.length > 0
          ? `已选 ${selection.length} 张 · ${formatSize(selectedBytes)}`
          : `库内共 ${images.length} 张`}
      </span>
    </footer>
  );
}
