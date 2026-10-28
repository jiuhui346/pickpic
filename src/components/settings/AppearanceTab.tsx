import { useStore } from "../../store/useStore";
import type { Theme } from "../../lib/types";
import { Button } from "../ui";
import { Row, Segmented, SettingsSection } from "./controls";

/** 外观：缩略图、主题、简洁模式、动图。 */
export function AppearanceTab() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);

  return (
    <div className="space-y-6">
      <SettingsSection title="网格" description="在网格中按住 Ctrl 滚动滚轮调整缩略图大小（110–340）">
        <Row label="动图预览" hint="网格中直接播放 GIF / 动态 WebP（较大动图可能影响滚动）">
          <Button
            variant={settings.animateThumbs ? "primary" : "secondary"}
            onClick={() => void setSettings({ animateThumbs: !settings.animateThumbs })}
          >
            {settings.animateThumbs ? "已开启" : "已关闭"}
          </Button>
        </Row>
      </SettingsSection>

      <SettingsSection title="界面" description="主题与信息密度">
        <Row label="主题">
          <Segmented<Theme>
            value={settings.theme}
            options={[
              { value: "dark", label: "深色" },
              { value: "light", label: "浅色" },
              { value: "system", label: "跟随系统" },
            ]}
            onChange={(value) => void setSettings({ theme: value })}
          />
        </Row>
        <Row label="简洁模式" hint="隐藏界面中的小字提示">
          <Button
            variant={settings.hideHints ? "primary" : "secondary"}
            onClick={() => void setSettings({ hideHints: !settings.hideHints })}
          >
            {settings.hideHints ? "已开启" : "已关闭"}
          </Button>
        </Row>
      </SettingsSection>
    </div>
  );
}
