import { invoke } from "@tauri-apps/api/core";
import type { TranscriptSegment } from "./workspace-types";
import { validSegmentWords } from "./transcript-text";

export interface TranscriptRecord {
  version: 1;
  mediaId: string;
  language: string;
  model: string;
  segments: TranscriptSegment[];
}

export interface TranscriptionJob {
  jobId: string;
  projectId: string;
  state: "running" | "completed" | "failed" | "cancelled";
  stage: "extracting" | "transcribing" | "saving";
  error: string | null;
  progress: number;
}

export type TranscriptionProfile = "turbo" | "large";
export interface TranscriptionEngine { available: boolean; model: string; error: string | null; profiles?: { id: TranscriptionProfile; available: boolean }[] }

export function isTranscriptionJob(value: unknown): value is TranscriptionJob {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<TranscriptionJob>;
  return typeof v.jobId === "string" && typeof v.projectId === "string"
    && ["running", "completed", "failed", "cancelled"].includes(v.state ?? "")
    && ["extracting", "transcribing", "saving"].includes(v.stage ?? "")
    && typeof v.progress === "number" && Number.isInteger(v.progress) && v.progress >= 0 && v.progress <= 100
    && (v.error === null || typeof v.error === "string");
}

export function parseTranscript(value: unknown): TranscriptRecord {
  if (!value || typeof value !== "object") throw new Error("Resposta de transcrição inválida.");
  const v = value as Partial<TranscriptRecord>;
  if (v.version !== 1 || typeof v.mediaId !== "string" || typeof v.language !== "string" || typeof v.model !== "string"
    || !Array.isArray(v.segments) || !v.segments.every(s => s && typeof s.id === "string" && typeof s.text === "string"
      && Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end > s.start && validSegmentWords(s))) {
    throw new Error("Resposta de transcrição inválida.");
  }
  return v as TranscriptRecord;
}

export function parseEngineStatus(value: unknown): TranscriptionEngine {
  if (!value || typeof value !== "object") throw new Error("Diagnóstico do motor inválido.");
  const v = value as Partial<TranscriptionEngine>;
  if (typeof v.available !== "boolean" || typeof v.model !== "string" || (v.error !== null && typeof v.error !== "string")) {
    throw new Error("Diagnóstico do motor inválido.");
  }
  if (v.profiles !== undefined && (!Array.isArray(v.profiles) || v.profiles.some(profile => !["turbo","large"].includes(profile.id) || typeof profile.available !== "boolean"))) throw new Error("Opções de transcrição inválidas.");
  return v as TranscriptionEngine;
}

export async function getTranscriptionEngine() { return parseEngineStatus(await invoke<unknown>("transcription_status")); }
export const getTranscriptionJob = () => invoke<unknown>("transcription_job");
export const cancelTranscription = (jobId: string) => invoke<boolean>("cancel_transcription", { jobId });
export async function readTranscript(projectId: string, mediaId: string) {
  const result = await invoke<unknown>("get_transcript", { projectId, mediaId });
  return result === null ? null : parseTranscript(result);
}
export async function transcribeProject(projectId: string, mediaId: string, jobId: string, profile?: TranscriptionProfile, processor?: "auto" | "cpu") {
  return parseTranscript(await invoke<unknown>("transcribe_project", { projectId, mediaId, jobId, ...(profile ? { profile } : {}), ...(processor ? {processor} : {}) }));
}
export const saveTranscript = (projectId: string, mediaId: string, segments: TranscriptSegment[]) =>
  invoke<void>("save_transcript", { projectId, mediaId, segments });
