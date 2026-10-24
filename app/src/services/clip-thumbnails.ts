import { invoke } from "@tauri-apps/api/core";

export interface ClipThumbnail { src: string; width: number; height: number }
type ReadThumbnail = (mediaId: string, time: number) => Promise<unknown>;

function parseThumbnail(value: unknown): ClipThumbnail {
  if (!value || typeof value !== "object") throw new Error("Miniatura inválida.");
  const frame = value as Record<string, unknown>;
  if (!Array.isArray(frame.bytes) || frame.bytes[0] !== 255 || frame.bytes[1] !== 216 || frame.bytes.length > 512 * 1024
    || !frame.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    || typeof frame.width !== "number" || !Number.isFinite(frame.width) || frame.width <= 0
    || typeof frame.height !== "number" || !Number.isFinite(frame.height) || frame.height <= 0) {
    throw new Error("Miniatura inválida.");
  }
  let binary = "";
  for (let offset = 0; offset < frame.bytes.length; offset += 8192) {
    binary += String.fromCharCode(...frame.bytes.slice(offset, offset + 8192));
  }
  return { src: `data:image/jpeg;base64,${btoa(binary)}`, width: frame.width, height: frame.height };
}

export function createThumbnailLoader(read: ReadThumbnail, capacity = 64) {
  const cache = new Map<string, ClipThumbnail>();
  const pending = new Map<string, Promise<ClipThumbnail>>();
  let queue = Promise.resolve();
  return function load(mediaId: string, seconds: number): Promise<ClipThumbnail> {
    if (!Number.isFinite(seconds) || seconds < 0) return Promise.reject(new Error("Posição inválida."));
    const time = Math.round(seconds * 1000) / 1000;
    const key = `${mediaId}:${time}`;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key); cache.set(key, hit);
      return Promise.resolve(hit);
    }
    const underway = pending.get(key);
    if (underway) return underway;
    const result = queue.then(async () => {
      const frame = parseThumbnail(await read(mediaId, time));
      cache.set(key, frame);
      if (cache.size > capacity) cache.delete(cache.keys().next().value!);
      return frame;
    }).finally(() => pending.delete(key));
    pending.set(key, result);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
}

export const loadClipThumbnail = createThumbnailLoader((mediaId, time) =>
  invoke<unknown>("clip_thumbnail", { mediaId, time }));
