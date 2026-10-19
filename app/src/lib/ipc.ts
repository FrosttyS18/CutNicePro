/**
 * Camada de IPC — único ponto de contato com os comandos Tauri (Rust).
 * A UI nunca chama invoke diretamente; erros chegam como string legível.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CollectionIcon, CollectionMeta, ProjectMeta } from "./types";

export async function listProjects(): Promise<ProjectMeta[]> {
  return invoke<ProjectMeta[]>("list_projects");
}

export async function createProject(name: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("create_project", { name });
}

export async function openProject(id: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("open_project", { id });
}

export async function renameProject(id: string, name: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("rename_project", { id, name });
}

export function deleteProject(id: string): Promise<void> {
  return invoke<void>("delete_project", { id });
}

export function exportProjectFile(id:string,mediaId:string,kind:"video"|"srt"|"txt"):Promise<boolean> {
  return invoke<boolean>("export_project_file",{id,mediaId,kind});
}

// ---- Mídia persistente (M2A) ----

export interface MediaAnalysisDto {
  durationMs: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  fps: number;
}

export interface MediaEntryDto {
  mediaId: string;
  sha256: string;
  sizeBytes: number;
  ext: string;
  originalName: string;
  createdAtMs: number;
  projectIds: string[];
  analysis: MediaAnalysisDto | null;
  unavailable: boolean;
}

export interface ImportedMedia {
  entry: MediaEntryDto;
  analysisError: string | null;
}

export async function importMedia(
  projectId: string,
  srcPath: string,
  onProgress: (copied: number, total: number) => void,
): Promise<ImportedMedia> {
  const un = await listen<{ jobId: string; bytesCopied: number; totalBytes: number }>(
    "import://progress",
    (e) => onProgress(e.payload.bytesCopied, e.payload.totalBytes),
  );
  try {
    const raw = await invoke<string>("import_media", { projectId, srcPath });
    const payload = JSON.parse(raw) as MediaEntryDto & { analysisError?: string };
    return {
      entry: {
        mediaId: payload.mediaId,
        sha256: payload.sha256,
        sizeBytes: payload.sizeBytes,
        ext: payload.ext,
        originalName: payload.originalName,
        createdAtMs: payload.createdAtMs,
        projectIds: payload.projectIds,
        analysis: payload.analysis ?? null,
        unavailable: payload.unavailable,
      },
      analysisError: payload.analysisError ?? null,
    };
  } finally {
    un();
  }
}

export function cancelImport(jobId: string): Promise<boolean> {
  return invoke<boolean>("cancel_import", { jobId });
}

export function linkMedia(mediaId: string, projectId: string): Promise<MediaEntryDto> {
  return invoke<MediaEntryDto>("link_media", { mediaId, projectId });
}

export function getMedia(mediaId: string): Promise<MediaEntryDto | null> {
  return invoke<MediaEntryDto | null>("get_media", { mediaId });
}

export function analyzeMedia(mediaId: string): Promise<MediaAnalysisDto> {
  return invoke<MediaAnalysisDto>("analyze_media", { mediaId });
}

export function removeProjectMedia(projectId: string): Promise<string[]> {
  return invoke<string[]>("remove_project_media", { projectId });
}

export function mediaReconcile(): Promise<string> {
  return invoke<string>("media_reconcile");
}

export function mediaUrl(entry: { sha256: string; ext: string }): string {
  return `http://cnplocal.localhost/${entry.sha256}.${entry.ext}`;
}

// ---- Coleções (Fase 03B; arquivo próprio, retrocompatível) ----

export async function listCollections(): Promise<CollectionMeta[]> {
  return invoke<CollectionMeta[]>("list_collections");
}

export async function createCollection(
  name: string,
  icon: CollectionIcon,
): Promise<CollectionMeta> {
  return invoke<CollectionMeta>("create_collection", { name, icon });
}

export async function addProjectToCollection(
  collectionId: string,
  projectId: string,
): Promise<CollectionMeta> {
  return invoke<CollectionMeta>("add_project_to_collection", { collectionId, projectId });
}

export async function removeProjectFromCollection(
  collectionId: string,
  projectId: string,
): Promise<CollectionMeta> {
  return invoke<CollectionMeta>("remove_project_from_collection", {
    collectionId,
    projectId,
  });
}
