import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store/useStore";
import { api } from "../lib/ipc";
import type { PluginInfo, RemotePlugin } from "../lib/types";
import { Button } from "./ui";

/** 设置 → 插件：本地插件 + GitHub 在线插件源。 */
export function PluginsSettingsSection() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [remote, setRemote] = useState<RemotePlugin[]>([]);
  const [repoInput, setRepoInput] = useState(settings.pluginRepoUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [repoBusy, setRepoBusy] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setPlugins(await api.pluginsList());
    } catch (error) {
      useStore.getState().pushToast({
        kind: "error",
        message: "读取插件失败",
        detail: String(error),
      });
    }
  };

  const loadRemote = async (url: string) => {
    if (!url.trim()) {
      setRemote([]);
      setRepoError(null);
      return;
    }
    setRepoBusy(true);
    setRepoError(null);
    try {
      setRemote(await api.pluginRepoList(url.trim()));
    } catch (error) {
      setRemote([]);
      setRepoError(String((error as { message?: string }).message ?? error));
    } finally {
      setRepoBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    if (settings.pluginRepoUrl) void loadRemote(settings.pluginRepoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveRepo = async () => {
    await setSettings({ pluginRepoUrl: repoInput.trim() });
    await loadRemote(repoInput.trim());
  };

  const install = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "选择插件文件夹（包含 plugin.json）",
    });
    if (typeof picked !== "string") return;
    try {
      await api.pluginInstall(picked);
      await refresh();
      useStore.getState().pushToast({
        kind: "success",
        message: "插件已安装，默认禁用；启用后点「重新加载」",
      });
    } catch (error) {
      useStore.getState().pushToast({
        kind: "error",
        message: "安装插件失败",
        detail: String(error),
        sticky: true,
      });
    }
  };

  const toggle = async (plugin: PluginInfo) => {
    if (busy) return;
    setBusy(plugin.id);
    try {
      await api.pluginSetEnabled(plugin.id, !plugin.enabled);
      await refresh();
      useStore.getState().pushToast({
        kind: "info",
        message: `插件「${plugin.name}」已${plugin.enabled ? "关闭" : "启用"}，点「重新加载」生效`,
      });
    } finally {
      setBusy(null);
    }
  };

  const installRemote = async (plugin: RemotePlugin) => {
    if (repoBusy) return;
    setRepoBusy(true);
    try {
      await api.pluginRepoInstall(repoInput.trim(), plugin.id);
      await refresh();
      setRemote(await api.pluginRepoList(repoInput.trim()));
      useStore.getState().pushToast({
        kind: "success",
        message: `插件「${plugin.name}」已下载，默认禁用；启用后点「重新加载」`,
      });
    } catch (error) {
      useStore.getState().pushToast({
        kind: "error",
        message: "下载插件失败",
        detail: String((error as { message?: string }).message ?? error),
        sticky: true,
      });
    } finally {
      setRepoBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold">已安装插件</h3>
          <p className="hint-text mt-0.5 text-[11px] text-muted">
            插件可添加工具栏按钮、调用图库 API；之后的功能扩展都以插件形式提供
          </p>
        </div>
        <button
          className="text-[11px] text-muted hover:text-fg"
          onClick={() => window.location.reload()}
        >
          重新加载
        </button>
      </div>

      <div className="space-y-2">
        {plugins.length === 0 && (
          <div className="rounded-lg border border-line px-4 py-6 text-center text-[12px] text-muted">
            暂无插件。可以从下面的在线插件源安装，或点「安装本地插件…」。
          </div>
        )}
        {plugins.map((plugin) => (
          <div key={plugin.id} className="rounded-lg border border-line bg-panel/40 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-[13px]">
                  {plugin.name}
                  <span className="ml-2 text-[11px] text-muted">v{plugin.version}</span>
                </div>
                {plugin.description && (
                  <div className="hint-text mt-0.5 text-[11px] leading-4 text-muted">
                    {plugin.description}
                  </div>
                )}
                {plugin.error && <div className="mt-1 text-[11px] text-danger">{plugin.error}</div>}
              </div>
              <Button
                variant={plugin.enabled ? "primary" : "secondary"}
                onClick={() => void toggle(plugin)}
                disabled={busy === plugin.id || Boolean(plugin.error)}
              >
                {plugin.enabled ? "已启用" : "已禁用"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void install()}>
          安装本地插件…
        </Button>
        <Button variant="secondary" onClick={() => void api.pluginsOpenDir()}>
          打开插件目录
        </Button>
        <Button variant="ghost" onClick={() => void refresh()}>
          刷新列表
        </Button>
      </div>

      <section className="border-t border-line pt-5">
        <h3 className="text-[13px] font-semibold">在线插件源</h3>
        <p className="hint-text mt-0.5 text-[11px] leading-4 text-muted">
          填 GitHub 仓库里的 plugins/index.json 地址（jsDelivr 加速），安装后插件才会下载到本机。
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            placeholder="https://fastly.jsdelivr.net/gh/用户名/仓库@main/plugins/index.json"
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel2 px-2 text-[11px] outline-none focus:border-accent"
          />
          <Button variant="secondary" onClick={() => void saveRepo()}>
            保存并刷新
          </Button>
        </div>
        {repoError && <div className="mt-2 text-[11px] text-danger">插件源读取失败：{repoError}</div>}

        <div className="mt-3 space-y-2">
          {repoBusy && <div className="text-[12px] text-muted">正在读取插件源…</div>}
          {!repoBusy && remote.length === 0 && settings.pluginRepoUrl && !repoError && (
            <div className="text-[12px] text-muted">插件源里还没有插件。</div>
          )}
          {remote.map((plugin) => {
            const installed = plugins.find((item) => item.id === plugin.id);
            const upToDate = installed?.version === plugin.version;
            return (
              <div key={plugin.id} className="rounded-lg border border-line px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-[13px]">
                      {plugin.name}
                      <span className="ml-2 text-[11px] text-muted">v{plugin.version}</span>
                      {plugin.author && (
                        <span className="ml-2 text-[11px] text-muted">by {plugin.author}</span>
                      )}
                    </div>
                    {plugin.description && (
                      <div className="hint-text mt-0.5 text-[11px] leading-4 text-muted">
                        {plugin.description}
                      </div>
                    )}
                  </div>
                  <Button
                    variant={upToDate ? "secondary" : "primary"}
                    onClick={() => void installRemote(plugin)}
                    disabled={repoBusy || upToDate}
                  >
                    {upToDate ? "已安装" : installed ? "更新" : "安装"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] leading-4 text-muted">
        插件目录：%APPDATA%\PickPic\plugins；每个插件是含 plugin.json 与 main.js 的文件夹。
        插件是受信任的本地代码，安装前请确认来源。
      </p>
    </div>
  );
}
