/**
 * Camada de IPC — único ponto de contato com os comandos Tauri (Rust).
 * A UI nunca chama invoke diretamente; erros chegam como string legível.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CollectionIcon, CollectionMeta, ProjectMeta } from "./types";
import type { Composition } from "./composition-types";

export function loadEditorProject(projectId: string): Promise<unknown> {
  return invoke("load_editor_project", { projectId });
}
export function exportEditorDocument(projectId: string, clipId: string | null, jobId: string, document: Composition): Promise<boolean> {
  return invoke("export_editor_document", { projectId, clipId, jobId, document });
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
    && validAnalysis && (value.analysisError == null || typeof value.analysisError === "string");
}

export async function importMedia(
  projectId: string,
  srcPath: string,
  onProgress: (copied: number, total: number) => void,
  signal?: AbortSignal,
  assetKind?: "video"|"image"|"audio",
): Promise<ImportedMedia> {
  const checkCancelled = () => {
    if (signal?.aborted) throw new DOMException("Importação cancelada.", "AbortError");
  };
  checkCancelled();
  const jobId = crypto.randomUUID();
  let active = true;
  let cancellationError: unknown;
  let registrationSeen = false;
  const requestCancel = () => {
    void cancelImport(jobId).catch((error: unknown) => { cancellationError = error; });
  };
  const un = await listen<{ jobId: string; bytesCopied: number; totalBytes: number }>(
    "import://progress",
    (e) => {
      if (!active || e.payload.jobId !== jobId) return;
      if (signal?.aborted) {
        if (!registrationSeen) requestCancel();
      } else {
        onProgress(e.payload.bytesCopied, e.payload.totalBytes);
      }
      registrationSeen = true;
    },
  );
  try {
    checkCancelled();
    signal?.addEventListener("abort", requestCancel, { once: true });
    const raw = await invoke<string>("import_media", { projectId, srcPath, jobId, ...(assetKind ? {assetKind} : {}) });
    if (cancellationError) throw new Error(`Falha ao solicitar cancelamento: ${String(cancellationError)}`);
    checkCancelled();
    const payload: unknown = JSON.parse(raw);
    if (!isImportPayload(payload)) throw new Error("Resposta de importação inválida. Tente novamente.");
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
  } catch (error) {
    if (cancellationError) throw Object.assign(new Error(`Falha ao solicitar cancelamento: ${String(cancellationError)}`), { cause: error });
    checkCancelled();
    throw error;
  } finally {
    active = false;
    signal?.removeEventListener("abort", requestCancel);
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
