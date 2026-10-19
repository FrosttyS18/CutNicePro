import type { UploadSource, WorkspaceData, EditorSettings, UploadOptions } from "./workspace-types";

export const defaultEditorSettings = (): EditorSettings => ({
  ratio: "16:9", fit: "contain", captionModel: 1, text: "", volume: 1,
  muted: false, background: "#000000", trimStart: 0, trimEnd: null,
});

export function emptyWorkspace(): WorkspaceData {
  return { version: 1, media: null, transcript: [], transcriptMode: "empty", settings: defaultEditorSettings(), tool: "editor" };
}

export function sourceName(source: UploadSource): string {
  const name = source.kind === "local" ? source.video.file.name.replace(/\.[^.]+$/, "") : `Vídeo do YouTube · ${source.videoId}`;
  return Array.from(name.trim() || "Novo projeto").slice(0, 80).join("");
}

export function createWorkspace(source: UploadSource, options: UploadOptions): WorkspaceData {
  const media = source.kind === "local" ? {
    kind: "local" as const, name: source.video.file.name, videoId: null, url: null,
    width: source.video.width, height: source.video.height, duration: source.video.duration,
  } : { kind: "youtube" as const, name: sourceName(source), videoId: source.videoId, url: source.url,
    width: null, height: null, duration: null };
  return {
    version: 1, media, transcriptMode: "empty", tool: options.tool,
    settings: { ...defaultEditorSettings(), ratio: options.ratio, captionModel: options.model, trimEnd: media.duration },
    transcript: [],
  };
}

export function clampTime(value: number, duration: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), Math.max(duration, 0));
}

export function formatMediaTime(value: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
