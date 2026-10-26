import { applyMontageCaptionStyle } from "./composition-captions";
import { compositionFromLegacy } from "./composition-legacy";
import { fullVideoWorkspace, openClipWorkspace } from "./clip-workspace";
import type { CaptionStyle } from "./captions";
import type { Clip } from "./clips";
import type { Composition } from "./composition-types";
import type { EditorProjectState } from "./composition-persistence";
import type { WorkspaceData } from "./workspace-types";

export interface RelatedClipDraft { clipId: string; expectedRevision: number; document: Composition }
export interface PreparedRelatedClip extends RelatedClipDraft { baseDocument: Composition }
export interface PreparedCompositionBatch { document: Composition; related: PreparedRelatedClip[] }
export interface CompositionBatchReceipt { document: Composition | null; related: Record<string, Composition> }
export interface RecoveryClipDraft extends RelatedClipDraft { baseDocument?: Composition }
interface LegacySource { mediaId: string; unavailable: boolean; analysis: { durationMs: number; width: number; height: number; fps?: number; hasAudio?: boolean } | null }
interface Request {
  activeClipId: string | null;
  document: Composition;
  related: PreparedRelatedClip[];
  saved: EditorProjectState;
  clips: Clip[];
  legacy: WorkspaceData;
  source?: LegacySource | null;
  model: number;
  style: CaptionStyle;
}
export function compositionContentKey(document: Composition): string {
  return JSON.stringify({ ...document, revision: 0 }, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}
export function prepareCaptionBatch(request: Request): PreparedCompositionBatch {
  if (!request.clips.length) throw new Error("Este projeto ainda não tem cortes.");
  const ids = new Set<string>();
  const related = new Map(request.related.map(draft => [draft.clipId, draft]));
  const document = applyMontageCaptionStyle(request.document, request.model, request.style);
  let legacyTranscript: Composition["assets"][number]["transcript"] | undefined;
  for (const clip of request.clips) {
    if (!/^[a-f\d]{64}$/i.test(clip.id) || ids.has(clip.id)) throw new Error("Identificador de clipe inválido no lote.");
    ids.add(clip.id);
    if (clip.id === request.activeClipId) continue;
    const pending = related.get(clip.id);
    const saved = request.saved.clips[clip.id];
    let baseline = pending?.baseDocument ?? saved?.document;
    if (!baseline) {
      const media = request.legacy.media, source = request.source;
      if (!media?.mediaId || request.legacy.transcriptMode !== "real" || !request.legacy.transcript.length || !source || source.mediaId !== media.mediaId || source.unavailable
        || !source.analysis || source.analysis.durationMs <= 0 || source.analysis.width <= 0 || source.analysis.height <= 0) {
        throw new Error("Reconecte a fonte e confirme a transcrição real antes de aplicar o estilo aos cortes antigos.");
      }
      const legacy = { ...request.legacy, media: { ...media, duration: source.analysis.durationMs / 1000, width: source.analysis.width, height: source.analysis.height } };
      baseline = compositionFromLegacy(openClipWorkspace(fullVideoWorkspace(legacy), clip), source.analysis, legacyTranscript);
      legacyTranscript ??= baseline.assets[0].transcript;
    }
    const current = pending?.document ?? baseline;
    const changed = applyMontageCaptionStyle(current, request.model, request.style);
    if (pending || compositionContentKey(changed) !== compositionContentKey(baseline)) related.set(clip.id, {
      clipId: clip.id, expectedRevision: pending?.expectedRevision ?? saved?.document.revision ?? 0, baseDocument: baseline, document: changed,
    });
  }
  return { document, related: [...related.values()] };
}
