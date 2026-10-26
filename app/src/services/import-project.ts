import * as ipc from "../lib/ipc";
import { mediaProjectName } from "../lib/media-name";
import { initialEditorSettings } from "../lib/workspace";
import type { UploadOptions } from "../lib/workspace-types";
import type { ProjectMeta } from "../lib/types";
import { verifySplitSettings } from "./split-framing";
import { attachPersistedMedia, removeWorkspace, saveWorkspace } from "./workspace-store";

export class ImportRollbackError extends Error {
  constructor(public readonly projectId: string, cause: unknown, cleanup: unknown) {
    super(`${message(cause)} Não foi possível remover o projeto da tentativa ${projectId}: ${message(cleanup)}. Confira a lista de projetos antes de tentar novamente.`);
    this.name = "ImportRollbackError";
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Importação cancelada.", "AbortError");
}

export async function importProject(
  path: string,
  name: string,
  options: UploadOptions,
  onProgress: (copied: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ProjectMeta & { importNotice?: string }> {
  checkCancelled(signal);
  const settings = initialEditorSettings(options, null);
  const project = await ipc.createProject(name.trim() || mediaProjectName(path));
  try {
    checkCancelled(signal);
    const imported = await ipc.importMedia(project.id, path, onProgress, signal);
    checkCancelled(signal);
    const { entry, analysisError } = imported;
    const analysis = entry.analysis;
    if (entry.unavailable || !analysis || analysis.width <= 0 || analysis.height <= 0 || analysis.durationMs <= 0) {
      throw new Error(analysisError || "Não foi possível validar o vídeo. Confira o arquivo e tente novamente.");
    }
    let importNotice: string | undefined;
    if (settings.splitScreen) {
      try {
        const result = await verifySplitSettings({ ...settings, splitScreen: { ...settings.splitScreen, faceValidated: false } },
          { projectId: project.id, mediaId: entry.mediaId, start: 0, end: analysis.durationMs / 1000 });
        settings.splitScreen = result.settings.splitScreen;
        if (!settings.splitScreen) importNotice = result.notice;
      } catch {
        settings.splitScreen = null;
        importNotice = "Vídeo importado em quadro único. Não foi possível confirmar duas pessoas; tente novamente em Enquadrar.";
      }
      checkCancelled(signal);
    }
    const saved = saveWorkspace(project.id, {
      version: 2,
      media: { kind: "local", name: entry.originalName, videoId: null, url: null, mediaId: entry.mediaId,
        width: analysis.width, height: analysis.height, duration: analysis.durationMs / 1000 },
      transcript: [],
      transcriptMode: "empty",
      settings: { ...settings, trimEnd: analysis.durationMs / 1000 },
      tool: options.tool,
    });
    if (!saved) throw new Error("Não foi possível salvar as configurações do projeto neste dispositivo.");
    attachPersistedMedia(project.id, entry.mediaId, ipc.mediaUrl(entry));
    return importNotice ? { ...project, importNotice } : project;
  } catch (error) {
    try {
      await ipc.deleteProject(project.id);
      removeWorkspace(project.id);
    } catch (cleanup) {
      throw new ImportRollbackError(project.id, error, cleanup);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
