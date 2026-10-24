import { invoke } from "@tauri-apps/api/core";
import { effectiveCaptionStyle } from "./captions";
import type { EditorSettings, EditSegment, SourceDescriptor } from "./workspace-types";
import { normalizePlan } from "./edit-plan";
import type { AspectRatio } from "../components/upload/tools";
import { defaultEditorSettings } from "./workspace";

export type ClipReview = "pending" | "approved" | "rejected";
export type ClipQuality = "qwen35" | "standard" | "experimentalGemma";
export interface ClipEngine { backend: string; model: string; template: string; sampling: string; seed: number }
export interface ClipAnalysis { title: string; summary: string; criteria: {label: string; score: number; explanation: string; evidence: string}[] }
export type ClipFit = "cover" | "contain";
export interface FaceFraming { status: "stable" | "ambiguous" | "noFaces" | "unavailable"; samples: number; x?: number; y?: number; confidence?: number }
export interface MultimodalEvidence { frames: number[]; visual: string; audioEvents: string[]; boundaryAdjustments: [number, number]; backend: string; framing?: { cx: number; cy: number; source: string } }
export interface Clip { id: string; start: number; end: number; title: string; score: number; reasons: string[]; review: ClipReview; format?: AspectRatio; fit?: ClipFit; analysis?: ClipAnalysis; analysisError?: string;
  faceFraming?: FaceFraming;
  /** Evidências multimodais realmente recebidas (M3): frames/áudio com timestamps. */
  multimodal?: MultimodalEvidence;
  /** Criação real (ms-epoch); ausente em legados = nunca inventado. */
  createdAtMs?: number;
  /** Assinatura da janela da transcrição que alimentou a análise (invalidação granular, atualização 19). */
  analysisSignature?: string;
  /** Análise DESATUALIZADA (upd 20): preservada para recuperação, mas NÃO é avaliação válida do texto atual. */
  analysisStale?: boolean;
  /** Exclusão recuperável: `true` sai da experiência; nada é apagado e a restauração desfaz. */
  deleted?: boolean;
  /** Motor que gerou este clipe (biblioteca cumulativa mistura resultados históricos). */
  engine?: ClipEngine }
export interface ClipCollection { version: 1; mediaId: string; transcriptHash: string; clips: Clip[]; engine?: ClipEngine }
export interface ClipOptions { format?: AspectRatio; fit?: ClipFit; quality?: ClipQuality; automatic?: boolean; minSeconds?: number; maxSeconds?: number; count?: number }
export interface ClipJob { jobId: string; projectId: string; state: "running" | "completed" | "failed" | "cancelled"; stage: "analyzing" | "rendering"; progress: number; error: string | null; operation?: "generate" | "analyze" | "export" }

export function parseClips(value: unknown): ClipCollection {
  if (!value || typeof value !== "object") throw new Error("Cortes inválidos.");
  const v = value as Partial<ClipCollection>;
  const ids = new Set<string>();
  // Atualização 19: a biblioteca é CUMULATIVA — sem teto total aqui; o limite
  // de 12 é por EXECUÇÃO (dialog/backend), não do total armazenado.
  if (v.version !== 1 || typeof v.mediaId !== "string" || typeof v.transcriptHash !== "string" || !Array.isArray(v.clips)
    || !v.clips.every(c => c && typeof c.id === "string" && /^[a-f\d]{64}$/i.test(c.id) && !ids.has(c.id) && Boolean(ids.add(c.id))
      && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start && typeof c.title === "string" && c.title.length > 0
      && Number.isInteger(c.score) && c.score >= 0 && c.score <= 100 && Array.isArray(c.reasons) && c.reasons.every(r => typeof r === "string")
      && (c.format === undefined || ["16:9","9:16","1:1","4:5"].includes(c.format))
      && (c.fit === undefined || ["cover","contain"].includes(c.fit))
      && (c.faceFraming === undefined || validFaceFraming(c.faceFraming))
      && (c.analysis === undefined || validAnalysis(c.analysis))
      && (c.analysisError === undefined || typeof c.analysisError === "string")
      && (c.analysisSignature === undefined || typeof c.analysisSignature === "string")
      && (c.analysisStale === undefined || typeof c.analysisStale === "boolean")
      && (c.multimodal === undefined || (typeof c.multimodal.visual === "string" && c.multimodal.visual.length > 0
        && Array.isArray(c.multimodal.frames) && c.multimodal.frames.every(f => Number.isFinite(f))
        && Array.isArray(c.multimodal.audioEvents) && c.multimodal.audioEvents.every(e => typeof e === "string")
        && Array.isArray(c.multimodal.boundaryAdjustments) && c.multimodal.boundaryAdjustments.length === 2
        && typeof c.multimodal.backend === "string"
        && (c.multimodal.framing === undefined || (Number.isFinite(c.multimodal.framing.cx) && Number.isFinite(c.multimodal.framing.cy)
          && typeof c.multimodal.framing.source === "string"))
        && (c.createdAtMs === undefined || (Number.isFinite(c.createdAtMs) && c.createdAtMs > 0))))
      && (c.deleted === undefined || typeof c.deleted === "boolean")
      && (c.engine === undefined || validEngine(c.engine))
      && ["pending", "approved", "rejected"].includes(c.review))) throw new Error("Cortes inválidos.");
  return v as ClipCollection;
}
function validEngine(value: ClipEngine): boolean {
  return Boolean(value && typeof value.backend === "string" && typeof value.model === "string"
    && typeof value.template === "string" && typeof value.sampling === "string" && Number.isInteger(value.seed));
}
function validFaceFraming(value: FaceFraming): boolean {
  if (!value || !["stable", "ambiguous", "noFaces", "unavailable"].includes(value.status)
    || !Number.isInteger(value.samples) || value.samples < 0 || value.samples > 12) return false;
  const unit = (v: number | undefined) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  return value.status === "stable" ? value.samples > 0 && unit(value.x) && unit(value.y) && unit(value.confidence)
    : value.x === undefined && value.y === undefined && value.confidence === undefined;
}
function validAnalysis(value: ClipAnalysis): boolean {
  return Boolean(value && typeof value.title === "string" && typeof value.summary === "string" && Array.isArray(value.criteria)
    && value.criteria.length === 3 && value.criteria.every((criterion,index) => criterion && criterion.label === ["Gancho","Desenvolvimento","Fechamento"][index]
      && Number.isInteger(criterion.score) && criterion.score >= 0 && criterion.score <= 100 && typeof criterion.explanation === "string" && typeof criterion.evidence === "string"));
}
export function isClipJob(value: unknown): value is ClipJob {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ClipJob>;
  return typeof v.jobId === "string" && typeof v.projectId === "string" && ["analyzing", "rendering"].includes(v.stage ?? "")
    && ["running", "completed", "failed", "cancelled"].includes(v.state ?? "") && Number.isInteger(v.progress) && Number(v.progress) >= 0 && Number(v.progress) <= 100
    && (v.operation === undefined || ["generate","analyze","export"].includes(v.operation))
    && (v.error === null || typeof v.error === "string");
}
/**
 * Configurações efetivas do clipe. Atualização 20 (auditoria): preserva a
 * EDIÇÃO salva — o intervalo efetivamente aparado dentro do clipe e a
 * escolha de legendas (captionModel 0 = desativadas é LEGÍTIMO e nunca é
 * trocado por outro modelo). Limites salvos fora do clipe são apenas
 * ajustados para dentro; ausentes usam os limites originais do clipe.
 */
export function clipSettings(settings: EditorSettings, clip: Clip): EditorSettings {
  const start = Number.isFinite(settings.trimStart)
    ? Math.min(Math.max(settings.trimStart, clip.start), clip.end)
    : clip.start;
  const end = settings.trimEnd !== null && Number.isFinite(settings.trimEnd)
    ? Math.min(Math.max(settings.trimEnd, start), clip.end)
    : clip.end;
  return { ...settings, trimStart: start, trimEnd: end,
    captionStyle: effectiveCaptionStyle(settings.captionModel, settings.captionStyle) };
}
export function isolatedClipSettings(clip: Clip, saved?: EditorSettings, media?: Pick<SourceDescriptor,"width" | "height"> | null): EditorSettings {
  const defaults = defaultEditorSettings();
  const sourceRatio = media?.width && media.height ? media.width/media.height : 16/9;
  const ratios: AspectRatio[] = ["16:9","9:16","1:1","4:5"];
  const fallback = ratios.reduce((best,ratio) => Math.abs(Number(ratio.split(":")[0])/Number(ratio.split(":")[1])-sourceRatio)
    < Math.abs(Number(best.split(":")[0])/Number(best.split(":")[1])-sourceRatio) ? ratio : best);
  // sem edição salva: limites originais do clipe, legendas ATIVAS (padrão
  // histórico) e ENQUADRAMENTO AUTOMÁTICO por tracking (M4) quando houver;
  // com edição salva: tudo vem do que o usuário deixou — a edição manual
  // vence e desativa a automação para este corte.
  if (saved) return clipSettings(saved, clip);
  const fresh = { ...defaults, ratio: clip.format ?? fallback, fit: clip.fit ?? "contain", captionModel: 2 } as EditorSettings;
  if (clip.faceFraming?.status === "stable" && validFaceFraming(clip.faceFraming) && fresh.fit === "cover") {
    fresh.focalPoint = { x: clip.faceFraming.x! * 100, y: clip.faceFraming.y! * 100 };
    return clipSettings(fresh, clip);
  }
  if (clip.faceFraming?.status === "ambiguous" && fresh.fit === "cover") {
    fresh.fit = "contain";
    return clipSettings(fresh, clip);
  }
  const framing = clip.multimodal?.framing;
  if (framing && Number.isFinite(framing.cx) && Number.isFinite(framing.cy)) {
    fresh.focalPoint = { x: Math.round(framing.cx * 100), y: Math.round(framing.cy * 100) };
  }
  return clipSettings(fresh, clip);
}
/** Payload do export: editPlan NÃO viaja (deny_unknown_fields no Rust); o
 * contrato é `segments` (render/settings.rs). Plano vazio/ausente → backend
 * usa o intervalo único do trim (effective_segments). */
export function renderSettings(settings: EditorSettings): EditorSettings & { segments?: EditSegment[] } {
  const { editPlan, ...rest } = settings;
  const segments = normalizePlan(editPlan);
  return { ...rest, captionStyle: effectiveCaptionStyle(settings.captionModel, settings.captionStyle), ...(segments.length ? { segments } : {}) };
}
export function clipMessage(error: unknown): string {
  const text = String(error);
  if (/cortes inválidos/i.test(text)) return "O aplicativo recebeu cortes em um formato inválido. Seus cortes salvos foram mantidos. Tente novamente.";
  if (/abertura.*fechamento/i.test(text)) return "Não foram aprovados cortes com abertura e fechamento completos nesta rodada. Seus cortes salvos foram mantidos. Tente outra faixa ou amplie a duração máxima.";
  if (/avaliar os trechos propostos/i.test(text)) return "Não foi possível aprovar os trechos propostos nesta rodada. Tente novamente ou escolha outra faixa do vídeo.";
  if (/motor experimental|gemma|modelo de análise/i.test(text)) return "A IA local (Gemma 4) está indisponível neste dispositivo. Verifique o modelo em .tooling/vendor (o arquivo do modelo e os binários precisam estar presentes) e tente novamente.";
  if (/trechos completos|selecionar os momentos/i.test(text)) return "Não encontramos trechos completos nesta duração. Aumente a duração dos cortes e tente novamente.";
  if (/transcrição mudou/i.test(text)) return "A transcrição mudou. Atualize os cortes do projeto para analisar novamente.";
  if (/evidências válidas/i.test(text)) return "Não foi possível confirmar a análise deste trecho. Tente analisar novamente.";
  if (/análise.*indisponível/i.test(text)) return "A análise está indisponível. Repare a instalação do aplicativo e tente novamente.";
  if (/análise/i.test(text)) return "Não foi possível analisar este trecho. Tente novamente.";
  if (/andamento|aguarde/i.test(text)) return "Há um processamento em andamento. Aguarde ou cancele antes de continuar.";
  if (/fala suficiente/i.test(text)) return "Não há fala suficiente para sugerir cortes. Escolha outro vídeo.";
  if (/transcreva|transcrição/i.test(text)) return "Transcreva o vídeo antes de gerar cortes com legendas.";
  if (/FFmpeg/i.test(text)) return "Um recurso de vídeo está indisponível. Repare a instalação do aplicativo e tente novamente.";
  if (/intervalo|proporção|configurações/i.test(text)) return "Revise o intervalo e o enquadramento do vídeo e tente novamente.";
  if (/disponível|disponibilidade|reconecte|encontrado/i.test(text)) return "O vídeo está indisponível. Reconecte o arquivo original e tente novamente.";
  if (/espaço|disk full|os error 112|no space left/i.test(text)) return "Não há espaço suficiente para concluir. Libere espaço no disco e tente novamente.";
  return "Não foi possível concluir o processamento. Tente novamente.";
}
export async function getClips(projectId: string, mediaId: string) {
  const value = await invoke<unknown>("get_clips", { projectId, mediaId });
  return value === null ? null : parseClips(value);
}
export async function getProjectClips(projectId: string) {
  const value = await invoke<unknown>("get_project_clips",{projectId});
  return value === null ? null : parseClips(value);
}
export async function generateClips(projectId: string, mediaId: string, jobId: string, options: ClipOptions) {
  return parseClips(await invoke<unknown>("generate_clips", { projectId, mediaId, jobId, options }));
}
export async function analyzeClip(projectId: string,mediaId: string,clipId: string,jobId: string) {
  return parseClips(await invoke<unknown>("analyze_clip",{projectId,mediaId,clipId,jobId}));
}
export async function reviewClip(projectId: string, mediaId: string, clipId: string, review: ClipReview) {
  return parseClips(await invoke<unknown>("review_clip", { projectId, mediaId, clipId, review }));
}
/** Exclusão persistente recuperável: marca sem apagar nada. */
export async function deleteClip(projectId: string, mediaId: string, clipId: string) {
  return parseClips(await invoke<unknown>("delete_clip", { projectId, mediaId, clipId }));
}
export async function restoreClip(projectId: string, mediaId: string, clipId: string) {
  return parseClips(await invoke<unknown>("restore_clip", { projectId, mediaId, clipId }));
}
export const getClipJob = () => invoke<unknown>("clips_job");
export const cancelClips = (jobId: string) => invoke<boolean>("cancel_clips", { jobId });
export const exportVideo = (projectId: string, mediaId: string, jobId: string, settings: EditorSettings, clipId?: string) =>
  invoke<boolean>("export_video", { projectId, mediaId, jobId, settings: renderSettings(settings), clipId: clipId ?? null });


/** G7 (goal-recuperacao-autoclip): tempo relativo SEM gerar nova data —
 *  recebe `now` para poder testar; "Agora", "há N min/h/d". */
export function relativeTime(fromMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - fromMs);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Agora";
  if (min < 60) return `há ${min} minuto${min > 1 ? "s" : ""}`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} hora${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days > 1 ? "s" : ""}`;
}

export const CLIP_NEW_WINDOW_MS = 60 * 60 * 1000;

export function isClipNew(clip: Clip, nowMs = Date.now()): boolean {
  const created = clip.createdAtMs;
  return typeof created === "number" && Number.isFinite(created) && created > 0
    && nowMs >= created && nowMs - created < CLIP_NEW_WINDOW_MS;
}
