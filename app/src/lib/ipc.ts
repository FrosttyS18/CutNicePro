/**
 * Camada de IPC — único ponto de contato com os comandos Tauri (Rust).
 * A UI nunca chama invoke diretamente; erros chegam como string legível.
 */
import { parseExportCapabilities, parseExportDestination, parseExportReceipt, type ExportCapabilities, type ExportDestination, type ExportOptions, type ExportReceipt, type ExportRequest } from "./composition-export";
import { invoke } from "@tauri-apps/api/core";
import { runMediaFileJob, type MediaFileProgress } from "./media-file-job";
import type { CollectionIcon, CollectionMeta, ProjectMeta } from "./types";
import type { Composition } from "./composition-types";

export function loadEditorProject(projectId: string): Promise<unknown> {
  return invoke("load_editor_project", { projectId });
}
export async function exportEditorDocument(projectId: string, clipId: string | null, jobId: string, document: Composition, request?: ExportRequest): Promise<ExportReceipt | null> {
  return parseExportReceipt(await invoke<unknown>("export_editor_document", { projectId, clipId, jobId, document, ...request }));
}
export function chooseEditorExportDirectory(): Promise<string | null> {
  return invoke<string | null>("choose_editor_export_directory");
}
export async function getEditorExportCapabilities(): Promise<ExportCapabilities> {
  return parseExportCapabilities(await invoke<unknown>("get_editor_export_capabilities"));
}
export async function getEditorExportDestination(directory: string, fileName: string, options: ExportOptions): Promise<ExportDestination> {
  return parseExportDestination(await invoke<unknown>("get_editor_export_destination", { directory, fileName, options }));
}
export function getEditorExportPreview(projectId: string, clipId: string | null, document: Composition): Promise<unknown> {
  return invoke<unknown>("get_editor_export_preview", { projectId, clipId, document });
}
export function revealEditorExport(receiptId: string): Promise<void> {
  return invoke<void>("reveal_editor_export", { receiptId });
}
export function getEditorThumbnail(projectId: string, clipId: string, revision: number): Promise<number[]> {
  return invoke("get_editor_thumbnail", { projectId, clipId, revision });
}
export function createEditorClip(projectId: string, title: string, document: Composition): Promise<unknown> {
  return invoke("create_editor_clip", { projectId, title, document });
}
export function updateEditorClipMetadata(projectId: string, clipId: string, changes: { review?: "pending" | "approved" | "rejected"; deleted?: boolean }): Promise<unknown> {
  return invoke("update_editor_clip_metadata", { projectId, clipId, ...changes });
}
export function saveEditorDocument(projectId: string, clipId: string | null, document: Composition, expectedRevision: number): Promise<unknown> {
  return invoke("save_editor_document", { projectId, clipId, document, expectedRevision });
}
export interface EditorRelatedDraftDto { clipId: string; expectedRevision: number; document: Composition; baseDocument?: Composition }
export function saveEditorBatch(projectId: string, clipId: string | null, document: Composition, expectedRevision: number, related: EditorRelatedDraftDto[], activeChanged = true): Promise<unknown> {
  const targets = related.map(({ clipId, expectedRevision, document }) => ({ clipId, expectedRevision, document }));
  return invoke("save_editor_batch", { projectId, clipId, document, expectedRevision, related: targets, activeChanged });
}
export function saveEditorRecovery(projectId: string, clipId: string | null, document: Composition, baseRevision: number, related?: EditorRelatedDraftDto[]): Promise<void> {
  return invoke("save_editor_recovery", { projectId, clipId, document, baseRevision, ...(related?.length ? { related } : {}) });
}
export function getEditorRecovery(projectId: string, clipId: string | null): Promise<unknown> {
  return invoke("get_editor_recovery", { projectId, clipId });
}
export function discardEditorRecovery(projectId: string, clipId: string | null): Promise<void> {
  return invoke("discard_editor_recovery", { projectId, clipId });
}

export async function listProjects(): Promise<ProjectMeta[]> {
  return invoke<ProjectMeta[]>("list_projects");
}

export function suggestSplitScreen(input: { projectId: string; mediaId: string; start: number; end: number; viewport?: import("./workspace-types").SplitViewport }): Promise<unknown> {
  return invoke<unknown>("suggest_split_screen", input);
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
  storageKind?: "managed" | "reference";
  availability?: "available" | "missing" | "changed" | "inaccessible";
}

export interface ImportedMedia {
  entry: MediaEntryDto;
  analysisError: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImportPayload(value: unknown): value is MediaEntryDto & { analysisError?: string | null } {
  if (!isRecord(value)) return false;
  const analysis = value.analysis;
  const finite = (item: unknown) => typeof item === "number" && Number.isFinite(item) && item >= 0;
  const validAnalysis = analysis == null || (isRecord(analysis)
    && [analysis.durationMs, analysis.width, analysis.height, analysis.fps].every(finite)
    && typeof analysis.videoCodec === "string" && (analysis.audioCodec === null || typeof analysis.audioCodec === "string")
    && typeof analysis.hasAudio === "boolean");
  return [value.mediaId, value.sha256, value.ext, value.originalName].every((item) => typeof item === "string" && item.length > 0)
    && finite(value.sizeBytes) && finite(value.createdAtMs) && typeof value.unavailable === "boolean"
    && Array.isArray(value.projectIds) && value.projectIds.every((item: unknown) => typeof item === "string")
    && validAnalysis && (value.analysisError == null || typeof value.analysisError === "string")
    && (value.storageKind === undefined || value.storageKind === "managed" || value.storageKind === "reference")
    && (value.availability === undefined || typeof value.availability === "string" && ["available", "missing", "changed", "inaccessible"].includes(value.availability))
    && (value.availability === undefined || value.unavailable === (value.availability !== "available"));
}

function mediaEntry(payload: MediaEntryDto): MediaEntryDto {
  return {
    mediaId: payload.mediaId, sha256: payload.sha256, sizeBytes: payload.sizeBytes, ext: payload.ext,
    originalName: payload.originalName, createdAtMs: payload.createdAtMs, projectIds: payload.projectIds,
    analysis: payload.analysis ?? null, unavailable: payload.unavailable,
    storageKind: payload.storageKind ?? "managed",
    availability: payload.availability ?? (payload.unavailable ? "missing" : "available"),
  };
}

function rejectMediaResponse(message: string, signal?: AbortSignal): never {
  if (signal?.aborted) throw new DOMException("Importação cancelada.", "AbortError");
  throw new Error(message);
}

export async function importMedia(
  projectId: string,
  srcPath: string,
  onProgress: MediaFileProgress,
  signal?: AbortSignal,
  assetKind?: "video"|"image"|"audio",
): Promise<ImportedMedia> {
  const raw = await runMediaFileJob("import_media", { projectId, srcPath, ...(assetKind ? { assetKind } : {}) }, onProgress, signal);
  if (typeof raw !== "string") return rejectMediaResponse("Resposta de importação inválida. Tente novamente.", signal);
  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { return rejectMediaResponse("Resposta de importação inválida. Tente novamente.", signal); }
  if (!isImportPayload(payload)) return rejectMediaResponse("Resposta de importação inválida. Tente novamente.", signal);
  return { entry: mediaEntry(payload), analysisError: payload.analysisError ?? null };
}

export async function relinkMedia(projectId: string, mediaId: string, srcPath: string, onProgress: MediaFileProgress, signal?: AbortSignal): Promise<MediaEntryDto> {
  const payload = await runMediaFileJob("relink_media", { projectId, mediaId, srcPath }, onProgress, signal);
  if (!isImportPayload(payload) || payload.mediaId !== mediaId || !payload.projectIds.includes(projectId) || payload.unavailable) return rejectMediaResponse("Não foi possível confirmar o arquivo original. Tente novamente.", signal);
  return mediaEntry(payload);
}

export function cancelImport(jobId: string): Promise<boolean> {
  return invoke<boolean>("cancel_import", { jobId });
}

export async function linkMedia(mediaId: string, projectId: string): Promise<MediaEntryDto> {
  const payload: unknown = await invoke("link_media", { mediaId, projectId });
  if (!isImportPayload(payload)) throw new Error("Resposta de mídia inválida. Tente novamente.");
  return mediaEntry(payload);
}

export async function getMedia(mediaId: string): Promise<MediaEntryDto | null> {
  const payload: unknown = await invoke("get_media", { mediaId });
  if (payload === null) return null;
  if (!isImportPayload(payload)) throw new Error("Resposta de mídia inválida. Tente novamente.");
  return mediaEntry(payload);
}

export function revealEditorMedia(projectId: string, mediaId: string): Promise<void> {
  return invoke<void>("reveal_editor_media", { projectId, mediaId });
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

export function mediaUrl(entry: { mediaId?: string; sha256: string; ext: string }): string {
  const key = entry.mediaId ? `media/${encodeURIComponent(entry.mediaId)}` : entry.sha256;
  return `http://cnplocal.localhost/${key}.${entry.ext}`;
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
