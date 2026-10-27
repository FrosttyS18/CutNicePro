import type { EditorSettings, TranscriptSegment, TranscriptWord } from "./workspace-types";

export interface FrameRate { numerator: number; denominator: number }
export type MediaKind = "video" | "image" | "audio";
export type ItemKind = MediaKind | "caption";
export interface CompositionAsset {
  id: string;
  mediaId: string;
  name: string;
  kind: MediaKind;
  durationUs: number;
  width: number;
  height: number;
  hasAudio?: boolean;
  transcript: TranscriptSegment[];
}
export interface CompositionTrack {
  id: string;
  name: string;
  kind: "visual" | "audio" | "caption";
  primary: boolean;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  color?: string;
}
export interface CompositionMarker {
  id: string;
  name: string;
  frame: number;
  color: string;
}
export interface CompositionPlacement {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}
export interface CompositionItem {
  id: string;
  trackId: string;
  assetId: string;
  kind: ItemKind;
  startFrame: number;
  durationFrames: number;
  sourceStartUs: number;
  sourceEndUs: number;
  groupId: string;
  followsMain: boolean;
  placement?: CompositionPlacement;
  settings: EditorSettings;
  captionEdits: Record<string, string | {text:string;words?:TranscriptWord[]}>;
}
export interface Composition {
  version: 1;
  revision: number;
  fps: FrameRate;
  settings: EditorSettings;
  assets: CompositionAsset[];
  tracks: CompositionTrack[];
  items: CompositionItem[];
  markers?: CompositionMarker[];
}
