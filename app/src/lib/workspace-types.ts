import type { LocalVideo } from "./video-source";
import type { AspectRatio, ToolId } from "../components/upload/tools";

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
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface EditorSettings {
  ratio: AspectRatio;
  fit: "contain" | "cover";
  captionModel: number;
  text: string;
  volume: number;
  muted: boolean;
  background: string;
  trimStart: number;
  trimEnd: number | null;
}

export interface WorkspaceData {
  version: 1;
  media: SourceDescriptor | null;
  transcript: TranscriptSegment[];
  transcriptMode: "demo" | "empty";
  settings: EditorSettings;
  tool: ToolId;
}

export interface UploadOptions {
  tool: ToolId;
  model: number;
  ratio: AspectRatio;
}
