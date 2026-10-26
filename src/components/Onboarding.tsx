import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store/useStore";
import { api } from "../lib/ipc";
import type { AppError } from "../lib/types";
import { Button, TextInput } from "./ui";
import { IconFolder } from "./icons";

/** 首次启动 / 存储目录失效时的引导页。 */
export function Onboarding() {
  const bootError = useStore((s) => s.bootError);
  const hint = useStore((s) => s.vaultRootHint);
  const chooseVault = useStore((s) => s.chooseVault);

  const [path, setPath] = useState(hint ?? "");
  const [error, setError] = useState<string | null>(bootError);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (path) return;
    let alive = true;
    api
      .suggestedVaultPath()
      .then((suggested) => {
        if (alive) setPath((current) => current || suggested);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path]);

  const browse = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "选择图库存储目录",
      defaultPath: path || undefined,
    });
    if (typeof picked === "string") setPath(picked);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await chooseVault(path);
    } catch (err) {
      setError((err as AppError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="w-[560px] rounded-dlg border border-line bg-panel px-8 py-9 shadow-[var(--shadow)]">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-[15px] font-semibold text-white">
            图
          </span>
          <div>
            <h1 className="text-[17px] font-semibold">欢迎使用 拾图</h1>
            <p className="hint-text mt-0.5 text-[12px] text-muted">
              图片、缩略图和索引全部保存在你指定的目录里，软件不联网、不上传任何数据。
            </p>
          </div>
        </div>

        <div className="mt-6">
          <label className="text-[12px] text-muted">存储目录</label>
          <div className="mt-2 flex gap-2">
            <TextInput
              value={path}
              onChange={setPath}
              placeholder="例如 D:\\PickPic"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
            <Button variant="secondary" onClick={() => void browse()} className="shrink-0 whitespace-nowrap">
              <span className="flex items-center gap-1.5">
                <IconFolder size={14} />
                浏览
              </span>
            </Button>
          </div>
          <p className="hint-text mt-2 text-[11px] leading-5 text-muted">
            建议选择一个空间充足、不常移动的目录。目录内会创建 vault.db、images/ 与 thumbs/。
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] leading-5 text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !path.trim()}>
            {busy ? "正在初始化…" : "开始使用"}
          </Button>
        </div>
      </div>
    </div>
  );
}
