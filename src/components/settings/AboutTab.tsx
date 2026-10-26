import { useStore } from "../../store/useStore";
import { Row, SettingsSection } from "./controls";

/** 关于：版本与本机数据概况。 */
export function AboutTab() {
  const vault = useStore((s) => s.vault);
  const images = useStore((s) => s.images);
  const categories = useStore((s) => s.categories);
  const tags = useStore((s) => s.tags);

  return (
    <div className="space-y-6">
      <SettingsSection title="Image Vault" description="本地图库 · 完全离线 · 不上传任何数据">
        <Row label="版本">
          <span className="text-[12px] text-muted">v1.0.8</span>
        </Row>
        <Row label="图库目录" hint={vault?.root}>
          <span className="text-[12px] text-muted">SQLite + 原图 + 缩略图</span>
        </Row>
      </SettingsSection>

      <SettingsSection title="当前数据">
        <div className="grid grid-cols-3 gap-3 py-4">
          <Stat label="图片" value={images.length} />
          <Stat label="分类" value={categories.length} />
          <Stat label="标签" value={tags.length} />
        </div>
      </SettingsSection>

      <p className="text-[11px] leading-5 text-muted">
        备份方式：直接复制整个图库目录。换电脑时把目录拷过去，首次启动选择该目录即可继续使用。
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-panel2 px-3 py-3 text-center">
      <div className="text-[18px] font-semibold leading-6">{value}</div>
      <div className="hint-text mt-1 text-[11px] text-muted">{label}</div>
    </div>
  );
}
