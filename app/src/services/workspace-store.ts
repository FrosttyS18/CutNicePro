import { emptyWorkspace } from "../lib/workspace";
import type { EditorSettings, UploadSource, WorkspaceData } from "../lib/workspace-types";
import { aspectRatios } from "../components/upload/tools";
import { validSegmentWords } from "../lib/transcript-text";
import { isCaptionStyle } from "../lib/captions";

const key = (id: string) => `cnp.workspace.v1.${id}`;
const sessionMedia = new Map<string, { file: File; url: string }>();

function validSettings(settings: EditorSettings | undefined): boolean {
  return Boolean(settings && aspectRatios.includes(settings.ratio) && ["contain", "cover"].includes(settings.fit)
    && Number.isInteger(settings.captionModel) && settings.captionModel >= 0 && settings.captionModel <= 9
    && (settings.captionStyle === undefined || isCaptionStyle(settings.captionStyle))
    && (settings.focalPoint === undefined || [settings.focalPoint.x,settings.focalPoint.y].every(v => Number.isFinite(v) && v >= 0 && v <= 100))
    && typeof settings.text === "string" && settings.text.length <= 240
    && Number.isFinite(settings.volume) && settings.volume >= 0 && settings.volume <= 1 && typeof settings.muted === "boolean"
    && /^#[0-9a-f]{6}$/i.test(settings.background) && Number.isFinite(settings.trimStart) && settings.trimStart >= 0
    && (settings.trimEnd === null || (Number.isFinite(settings.trimEnd) && settings.trimEnd >= settings.trimStart)));
}
function validWorkspace(value: unknown): value is WorkspaceData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<WorkspaceData>;
  return (data.version === 1 || data.version === 2) && validSettings(data.settings) && ["demo", "empty", "real"].includes(data.transcriptMode ?? "")
    && (data.videoSettings === undefined || validSettings(data.videoSettings))
    && (data.clipEdits === undefined || Boolean(data.clipEdits && typeof data.clipEdits === "object" && !Array.isArray(data.clipEdits)
      && Object.entries(data.clipEdits).every(([id,value]) => /^[a-f\d]{64}$/i.test(id) && validSettings(value))))
    && (data.activeClipId === undefined || (typeof data.activeClipId === "string" && /^[a-f\d]{64}$/i.test(data.activeClipId)))
    && ["editor", "captions", "clips", "reframe"].includes(data.tool ?? "")
    && (data.media === null || Boolean(data.media && ["local", "youtube"].includes(data.media.kind)
      && typeof data.media.name === "string"
      && (data.media.kind !== "youtube" || (typeof data.media.videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(data.media.videoId)))))
    && Array.isArray(data.transcript) && data.transcript.every((segment) => segment && typeof segment.id === "string"
      && typeof segment.text === "string" && Number.isFinite(segment.start) && Number.isFinite(segment.end)
      && segment.start >= 0 && segment.end >= segment.start && validSegmentWords(segment));
}

function recoverCaptionPreferences(value:unknown):unknown {
  if(!value || typeof value!=="object")return value;
  const data=value as Record<string,unknown>;
  if(!data.settings || typeof data.settings!=="object")return value;
  const settings=data.settings as Record<string,unknown>;
  if(settings.captionStyle===undefined || isCaptionStyle(settings.captionStyle))return value;
  return {...data,settings:{...settings,captionStyle:undefined}};
}

export function readWorkspace(id: string): WorkspaceData {
  try {
    const raw = localStorage.getItem(key(id));
    const data: unknown = recoverCaptionPreferences(raw ? JSON.parse(raw) : null);
    if (!validWorkspace(data)) return emptyWorkspace();
    // M2A: migra v1→v2 preservando títulos/configurações (mediaId ausente ok)
    if (data.version === 1) {
      const migrated: WorkspaceData = { ...data, version: 2 };
      saveWorkspace(id, migrated);
      return migrated;
    }
    return data;
  } catch { return emptyWorkspace(); }
}

export function saveWorkspace(id: string, data: WorkspaceData): boolean {
  try { localStorage.setItem(key(id), JSON.stringify(data)); return true; }
  catch { return false; }
}

/**
 * M2A: mídia persistida (cópia em app-data) servida pelo scheme cnplocal.
 * Object URLs de sessão continuam para o caminho YouTube/referência.
 */
export function attachPersistedMedia(id: string, _mediaId: string, url: string): void {
  const previous = sessionMedia.get(id);
  if (previous) URL.revokeObjectURL(previous.url);
  sessionMedia.set(id, { file: null as unknown as File, url });
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

export function removeWorkspace(id: string): void {
  localStorage.removeItem(key(id));
  const media = sessionMedia.get(id);
  if (media) URL.revokeObjectURL(media.url);
  sessionMedia.delete(id);
}
