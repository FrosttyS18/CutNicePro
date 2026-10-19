import { emptyWorkspace } from "../lib/workspace";
import type { UploadSource, WorkspaceData } from "../lib/workspace-types";
import { aspectRatios } from "../components/upload/tools";

const key = (id: string) => `cnp.workspace.v1.${id}`;
const sessionMedia = new Map<string, { file: File; url: string }>();

function validWorkspace(value: unknown): value is WorkspaceData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<WorkspaceData>;
  const settings = data.settings;
  return data.version === 1 && Boolean(settings) && ["demo", "empty"].includes(data.transcriptMode ?? "")
    && ["editor", "captions", "clips", "reframe"].includes(data.tool ?? "")
    && Boolean(settings && aspectRatios.includes(settings.ratio) && ["contain", "cover"].includes(settings.fit)
      && Number.isInteger(settings.captionModel) && settings.captionModel >= 0 && settings.captionModel <= 9
      && typeof settings.text === "string" && settings.text.length <= 240
      && Number.isFinite(settings.volume) && settings.volume >= 0 && settings.volume <= 1
      && typeof settings.muted === "boolean" && /^#[0-9a-f]{6}$/i.test(settings.background)
      && Number.isFinite(settings.trimStart) && settings.trimStart >= 0
      && (settings.trimEnd === null || (Number.isFinite(settings.trimEnd) && settings.trimEnd >= settings.trimStart)))
    && (data.media === null || Boolean(data.media && ["local", "youtube"].includes(data.media.kind)
      && typeof data.media.name === "string"
      && (data.media.kind !== "youtube" || (typeof data.media.videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(data.media.videoId)))))
    && Array.isArray(data.transcript) && data.transcript.every((segment) => segment && typeof segment.id === "string"
      && typeof segment.text === "string" && Number.isFinite(segment.start) && Number.isFinite(segment.end)
      && segment.start >= 0 && segment.end >= segment.start);
}

export function readWorkspace(id: string): WorkspaceData {
  try {
    const raw = localStorage.getItem(key(id));
    const data: unknown = raw ? JSON.parse(raw) : null;
    return validWorkspace(data) ? data : emptyWorkspace();
  } catch { return emptyWorkspace(); }
}

export function saveWorkspace(id: string, data: WorkspaceData): boolean {
  try { localStorage.setItem(key(id), JSON.stringify(data)); return true; }
  catch { return false; }
}

export function attachSessionMedia(id: string, source: UploadSource): void {
  const previous = sessionMedia.get(id);
  if (previous) URL.revokeObjectURL(previous.url);
  sessionMedia.delete(id);
  if (source.kind === "local") sessionMedia.set(id, { file: source.video.file, url: URL.createObjectURL(source.video.file) });
}

export function getSessionMedia(id: string): string | null {
  return sessionMedia.get(id)?.url ?? null;
}

export function releaseSessionMedia(): void {
  sessionMedia.forEach(({ url }) => URL.revokeObjectURL(url));
  sessionMedia.clear();
}
