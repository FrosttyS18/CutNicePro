import type { EditorEffects, UploadSource, WorkspaceData, EditorSettings, UploadOptions } from "./workspace-types";
import { isSplitScreen } from "./split-screen";

export const DEFAULT_EFFECTS: EditorEffects = { brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0 };

export const defaultEditorSettings = (): EditorSettings => ({
  ratio: "16:9", fit: "contain", zoom: 1, effects: { ...DEFAULT_EFFECTS }, captionModel: 1, text: "", volume: 1,
  muted: false, background: "#000000", trimStart: 0, trimEnd: null,
});

export function emptyWorkspace(): WorkspaceData {
  return { version: 2, media: null, transcript: [], transcriptMode: "empty", settings: defaultEditorSettings(), tool: "editor" };
}

export function sourceName(source: UploadSource): string {
  const name = source.kind === "local" ? source.video.file.name.replace(/\.[^.]+$/, "") : `Vídeo do YouTube · ${source.videoId}`;
  return Array.from(name.trim() || "Novo projeto").slice(0, 80).join("");
}

export function initialEditorSettings(options: UploadOptions, duration: number | null): EditorSettings {
  if (options.splitScreen != null && (options.ratio !== "9:16" || !isSplitScreen(options.splitScreen))) {
    throw new Error("A composição com dois painéis precisa do formato 9:16 e posições válidas.");
  }
  return { ...defaultEditorSettings(), ratio: options.ratio, fit: options.fit ?? "contain", captionModel: options.model,
    trimEnd: duration, ...(options.splitScreen ? { splitScreen: options.splitScreen } : {}) };
}

export function createWorkspace(source: UploadSource, options: UploadOptions): WorkspaceData {
  const media = source.kind === "local" ? {
    kind: "local" as const, name: source.video.file.name, videoId: null, url: null,
    width: source.video.width, height: source.video.height, duration: source.video.duration,
  } : { kind: "youtube" as const, name: sourceName(source), videoId: source.videoId, url: source.url,
    width: null, height: null, duration: null };
  return {
    version: 2, media, transcriptMode: "empty", tool: options.tool,
    settings: initialEditorSettings(options, media.duration),
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
