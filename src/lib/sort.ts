import type { ImageMeta, SortField } from "./types";

/** 中文/英文自然排序：数字按数值比较（图2 < 图10），中文按拼音。 */
const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

export function sortImages(
  images: ImageMeta[],
  field: SortField,
  desc: boolean,
): ImageMeta[] {
  const list = [...images];
  list.sort((a, b) => compare(a, b, field));
  if (desc) list.reverse();
  return list;
}

function compare(a: ImageMeta, b: ImageMeta, field: SortField): number {
  switch (field) {
    case "name":
      return collator.compare(a.fileName, b.fileName);
    case "size":
      return a.sizeBytes - b.sizeBytes;
    case "mtime":
      return a.mtime - b.mtime;
    case "imported":
      return a.importedAt - b.importedAt;
    case "ext": {
      const byExt = collator.compare(a.ext, b.ext);
      return byExt !== 0 ? byExt : collator.compare(a.fileName, b.fileName);
    }
    default:
      return 0;
  }
}
