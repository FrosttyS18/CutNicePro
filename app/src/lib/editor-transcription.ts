import { invoke } from "@tauri-apps/api/core";
import { isTranscriptionJob, parseTranscript, type TranscriptRecord, type TranscriptionJob, type TranscriptionProfile } from "./transcription";

export interface EditorTranscriptionJob extends TranscriptionJob { mediaId: string }

export function isEditorTranscriptionJob(value: unknown): value is EditorTranscriptionJob {
  return isTranscriptionJob(value) && "mediaId" in value && typeof value.mediaId === "string" && value.mediaId.length > 0;
}

function parseJob(value: unknown, projectId: string, mediaId?: string): EditorTranscriptionJob {
  if (!isEditorTranscriptionJob(value) || value.projectId !== projectId || mediaId !== undefined && value.mediaId !== mediaId) {
    throw new Error("Resposta de transcrição incompatível com esta mídia.");
  }
  return value;
}

export async function getEditorTranscriptionJob(projectId: string, mediaId?: string) {
  const value = await invoke<unknown>("get_editor_media_transcription_job", { projectId, ...(mediaId ? { mediaId } : {}) });
  return value === null ? null : parseJob(value, projectId, mediaId);
}

export async function readEditorTranscript(projectId: string, mediaId: string): Promise<TranscriptRecord | null> {
  const value = await invoke<unknown>("get_editor_media_transcription", { projectId, mediaId });
  if (value === null) return null;
  const record = parseTranscript(value);
  if (record.mediaId !== mediaId) throw new Error("A transcrição pertence a outra mídia.");
  return record;
}

export async function transcribeEditorMedia(projectId: string, mediaId: string, profile: TranscriptionProfile = "turbo", executionMode: "auto" | "cpu" = "auto") {
  return parseJob(await invoke<unknown>("transcribe_editor_media", { projectId, mediaId, profile, executionMode }), projectId, mediaId);
}
