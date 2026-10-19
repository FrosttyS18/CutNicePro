import type { LocalVideo } from "./video-source";
import type { AspectRatio, ToolId } from "../components/upload/tools";
import type { CaptionStyle } from "./captions";

export type UploadSource = { kind: "local"; video: LocalVideo }
  | { kind: "youtube"; url: string; videoId: string };

export interface SourceDescriptor {
  kind: "local" | "youtube";
  name: string;
  videoId: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  /** M2A: mídia persistente (cópia em app-data). Ausente em dados v1. */
  mediaId?: string;
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

export interface TranscriptWord { text: string; start: number; end: number }

export interface EditorSettings {
  ratio: AspectRatio;
  fit: "contain" | "cover";
  focalPoint?: { x: number; y: number };
  captionModel: number;
  captionStyle?: CaptionStyle;
  text: string;
  volume: number;
  muted: boolean;
  background: string;
  trimStart: number;
  trimEnd: number | null;
}

export interface WorkspaceData {
  version: 1 | 2;
  media: SourceDescriptor | null;
  transcript: TranscriptSegment[];
  transcriptMode: "demo" | "empty" | "real";
  settings: EditorSettings;
  tool: ToolId;
  activeClipId?: string;
  videoSettings?: EditorSettings;
  clipEdits?: Record<string, EditorSettings>;
}

export interface UploadOptions {
  tool: ToolId;
  model: number;
  ratio: AspectRatio;
}
