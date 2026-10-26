import { useStore } from "../../store/useStore";
import { formatSize } from "../../lib/format";
import type { ExportMode, ImportMode } from "../../lib/types";
import { Button } from "../ui";
import { Row, Segmented, SettingsSection } from "./controls";

/** 通用：存储位置 + 拖入拖出行为。 */
export function GeneralTab({ onPickFolder }: { onPickFolder: () => void }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const vault = useStore((s) => s.vault);
  const images = useStore((s) => s.images);
  const totalBytes = images.reduce((sum, image) => sum + image.sizeBytes, 0);

  return (
    <div className="space-y-6">
      <SettingsSection
        title="存储"
        description="图片、缩略图与索引都保存在这个目录里"
      >
        <Row label="图库目录" hint={vault?.root}>
          <Button variant="secondary" onClick={onPickFolder}>
            修改…
          </Button>
        </Row>
        <Row label="当前图库" hint={`共 ${images.length} 张图片`}>
          <span className="text-[12px] text-muted">{formatSize(totalBytes)}</span>
        </Row>
      </SettingsSection>

      <SettingsSection title="导入与导出" description="决定原文件是移动还是保留副本">
        <Row
          label="拖入图片时"
          hint={settings.importMode === "move" ? "默认：原文件移入图库" : "原文件保留"}
        >
          <Segmented<ImportMode>
            value={settings.importMode}
            options={[
              { value: "move", label: "移动" },
              { value: "copy", label: "复制" },
            ]}
            onChange={(value) => void setSettings({ importMode: value })}
          />
        </Row>
        <Row
          label="拖出图片时"
          hint={settings.exportMode === "copy" ? "默认：库内保留副本" : "拖出成功后从库中移除"}
        >
          <Segmented<ExportMode>
            value={settings.exportMode}
            options={[
              { value: "copy", label: "复制" },
              { value: "move", label: "移动" },
            ]}
            onChange={(value) => void setSettings({ exportMode: value })}
          />
        </Row>
      </SettingsSection>
    </div>
  );
}
