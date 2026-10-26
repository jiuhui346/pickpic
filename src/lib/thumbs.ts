import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./ipc";

export interface ThumbInfo {
  url: string | null;
  width: number | null;
  height: number | null;
}

const cache = new Map<number, ThumbInfo>();
const pending = new Map<number, Promise<ThumbInfo>>();

const BROKEN: ThumbInfo = { url: null, width: null, height: null };

/** 已缓存的缩略图；undefined 表示还没请求过。 */
export function peekThumb(id: number): ThumbInfo | undefined {
  return cache.get(id);
}

/** 请求缩略图（同一张图并发请求会合并）。url 为 null 表示生成失败。 */
export async function ensureThumb(id: number): Promise<ThumbInfo> {
  const hit = cache.get(id);
  if (hit) return hit;
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;

  const promise = api
    .thumbEnsure(id)
    .then((result) => {
      const info: ThumbInfo =
        result.state === "ready" && result.path
          ? {
              url: convertFileSrc(result.path),
              width: result.width,
              height: result.height,
            }
          : BROKEN;
      cache.set(id, info);
      pending.delete(id);
      return info;
    })
    .catch(() => {
      cache.set(id, BROKEN);
      pending.delete(id);
      return BROKEN;
    });

  pending.set(id, promise);
  return promise;
}
