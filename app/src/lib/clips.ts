import { invoke } from "@tauri-apps/api/core";
import { effectiveCaptionStyle } from "./captions";
import type { EditorSettings, SourceDescriptor } from "./workspace-types";
import type { AspectRatio } from "../components/upload/tools";
import { defaultEditorSettings } from "./workspace";

export type ClipReview = "pending" | "approved" | "rejected";
export interface ClipAnalysis { title: string; summary: string; criteria: {label: string; score: number; explanation: string; evidence: string}[] }
export interface Clip { id: string; start: number; end: number; title: string; score: number; reasons: string[]; review: ClipReview; format?: AspectRatio; analysis?: ClipAnalysis }
export interface ClipCollection { version: 1; mediaId: string; transcriptHash: string; clips: Clip[] }
export interface ClipOptions { minSeconds: number; maxSeconds: number; count: number; format?: AspectRatio }
export interface ClipJob { jobId: string; projectId: string; state: "running" | "completed" | "failed" | "cancelled"; stage: "analyzing" | "rendering"; progress: number; error: string | null }

export function parseClips(value: unknown): ClipCollection {
  if (!value || typeof value !== "object") throw new Error("Cortes inválidos.");
  const v = value as Partial<ClipCollection>;
  const ids = new Set<string>();
  if (v.version !== 1 || typeof v.mediaId !== "string" || typeof v.transcriptHash !== "string" || !Array.isArray(v.clips) || v.clips.length > 12
    || !v.clips.every(c => c && typeof c.id === "string" && /^[a-f\d]{64}$/i.test(c.id) && !ids.has(c.id) && Boolean(ids.add(c.id))
      && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start && typeof c.title === "string" && c.title.length > 0
      && Number.isInteger(c.score) && c.score >= 0 && c.score <= 100 && Array.isArray(c.reasons) && c.reasons.every(r => typeof r === "string")
      && (c.format === undefined || ["16:9","9:16","1:1","4:5"].includes(c.format))
      && (c.analysis === undefined || validAnalysis(c.analysis))
      && ["pending", "approved", "rejected"].includes(c.review))) throw new Error("Cortes inválidos.");
  return v as ClipCollection;
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
    && (v.error === null || typeof v.error === "string");
}
export function clipSettings(settings: EditorSettings, clip: Clip): EditorSettings {
  const model = settings.captionModel || 2;
  return { ...settings, trimStart: clip.start, trimEnd: clip.end, captionModel: model, captionStyle: effectiveCaptionStyle(model, settings.captionStyle) };
}
export function isolatedClipSettings(clip: Clip, saved?: EditorSettings, media?: Pick<SourceDescriptor,"width" | "height"> | null): EditorSettings {
  const defaults = defaultEditorSettings();
  const sourceRatio = media?.width && media.height ? media.width/media.height : 16/9;
  const ratios: AspectRatio[] = ["16:9","9:16","1:1","4:5"];
  const fallback = ratios.reduce((best,ratio) => Math.abs(Number(ratio.split(":")[0])/Number(ratio.split(":")[1])-sourceRatio)
    < Math.abs(Number(best.split(":")[0])/Number(best.split(":")[1])-sourceRatio) ? ratio : best);
  return clipSettings(saved ?? { ...defaults, ratio: clip.format ?? fallback, fit: "contain", captionModel: 2 },clip);
}
export function renderSettings(settings: EditorSettings): EditorSettings {
  return { ...settings, captionStyle: effectiveCaptionStyle(settings.captionModel, settings.captionStyle) };
}
export function clipMessage(error: unknown): string {
  const text = String(error);
  if (/transcrição mudou/i.test(text)) return "A transcrição mudou. Atualize os cortes do projeto para analisar novamente.";
  if (/evidências válidas/i.test(text)) return "Não foi possível confirmar a análise deste trecho. Tente analisar novamente.";
  if (/análise.*indisponível/i.test(text)) return "A análise está indisponível. Repare a instalação do aplicativo e tente novamente.";
  if (/análise/i.test(text)) return "Não foi possível analisar este trecho. Tente novamente.";
  if (/aprove/i.test(text)) return "Aprove o corte antes de exportar.";
  if (/andamento|aguarde/i.test(text)) return "Há um processamento em andamento. Aguarde ou cancele antes de continuar.";
  if (/fala suficiente/i.test(text)) return "Não há fala suficiente para sugerir cortes. Escolha outro vídeo.";
  if (/transcreva|transcrição/i.test(text)) return "Transcreva o vídeo antes de gerar cortes com legendas.";
  if (/FFmpeg/i.test(text)) return "Um recurso de vídeo está indisponível. Repare a instalação do aplicativo e tente novamente.";
  if (/intervalo|proporção|configurações/i.test(text)) return "Revise o intervalo e o enquadramento do vídeo e tente novamente.";
  if (/disponível|disponibilidade|reconecte|encontrado/i.test(text)) return "O vídeo está indisponível. Reconecte o arquivo original e tente novamente.";
  return "Não foi possível processar o vídeo. Verifique o espaço disponível e tente novamente.";
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
export const getClipJob = () => invoke<unknown>("clips_job");
export const cancelClips = (jobId: string) => invoke<boolean>("cancel_clips", { jobId });
export const exportVideo = (projectId: string, mediaId: string, jobId: string, settings: EditorSettings, clipId?: string) =>
  invoke<boolean>("export_video", { projectId, mediaId, jobId, settings: renderSettings(settings), clipId: clipId ?? null });
