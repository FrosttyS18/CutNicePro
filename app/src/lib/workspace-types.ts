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

/** Ajustes visuais aplicados ao vídeo (paridade SupoClip): neutro = 100/100/100/0/0. */
export interface EditorEffects {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  hue: number;
}

/** Intervalo de mídia ORIGINAL incluído na composição do corte (segundos). */
export interface EditSegment {
  sourceStart: number;
  sourceEnd: number;
}

/**
 * Plano de edição versionado por corte (M2 cortes-multimodais): segmentos
 * ordenados e não sobrepostos da mídia original. A prévia, a timeline e a
 * exportação consomem o MESMO plano. Sem plano (projetos antigos): um único
 * segmento derivado de trimStart/trimEnd — compatível, sem migração.
 */
export interface EditPlan {
  version: 1;
  segments: EditSegment[];
}

export interface SplitPanel {
  x: number;
  y: number;
  zoom: number;
}

export interface SplitScreenSettings {
  version: 1;
  faceValidated?: boolean;
  top: SplitPanel;
  bottom: SplitPanel;
  shots?: SplitShot[];
}

export interface SplitShot extends EditSegment {
  top: SplitPanel;
  bottom: SplitPanel;
}

export interface SplitViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorSettings {
  ratio: AspectRatio;
  fit: "contain" | "cover";
  focalPoint?: { x: number; y: number };
  splitScreen?: SplitScreenSettings | null;
  /** Ampliação da imagem (1–3); combinada com fit/foco na prévia e na exportação. */
  zoom?: number;
  effects?: EditorEffects;
  captionModel: number;
  captionStyle?: CaptionStyle;
  text: string;
  /** 0–2 (0–200 %); a prévia limita a 100 %, a exportação aplica o valor integral. */
  volume: number;
  muted: boolean;
  background: string;
  trimStart: number;
  trimEnd: number | null;
  /** Plano multi-intervalo do corte; ausente = intervalo único (trim). */
  editPlan?: EditPlan | null;
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
  fit?: "contain" | "cover";
  splitScreen?: SplitScreenSettings | null;
}
