import { listen } from "@tauri-apps/api/event";
import { getMedia } from "../lib/ipc";
import { createPreparationTracker, type PreparationProgress } from "../lib/project-preparation";
import * as transcription from "../lib/transcription";
import { transcriptionMessage } from "../lib/transcription-feedback";
import type { ProjectMeta } from "../lib/types";
import type { UploadOptions } from "../lib/workspace-types";
import { importProject } from "./import-project";
import { readWorkspace, saveWorkspace } from "./workspace-store";
import { beginPreparation, completePreparation, setPreparationOutcome } from "./project-preparation-state";

interface PreparedProject { project: ProjectMeta; notice: string | null }

const cancelledNotice = "Transcrição cancelada. Seu vídeo e projeto foram mantidos. Você pode editar ou tentar transcrever novamente na visão geral.";

export async function prepareProject(
  path: string,
  name: string,
  options: UploadOptions,
  onImportProgress: (copied: number, total: number) => void,
  signal?: AbortSignal,
  onProgress?: (progress: PreparationProgress) => void,
): Promise<PreparedProject> {
  const track = createPreparationTracker();
  onProgress?.(track("validating"));
  const project = await importProject(path, name, options, (copied, total) => {
    onImportProgress(copied, total);
    onProgress?.(track("importing", copied, total));
  }, signal);
  const notices = project.importNotice ? [project.importNotice] : [];
  const mediaId = readWorkspace(project.id).media?.mediaId;
  let ownedJobId: string | null = null;
  const finish = (notice?: string, state: "completed" | "failed" | "cancelled" = "completed"): PreparedProject => {
    if (mediaId) {
      if (state === "completed") completePreparation(project.id, mediaId, ownedJobId);
      else setPreparationOutcome(project.id, mediaId, ownedJobId, state, notice ?? "A transcrição não foi concluída.");
    }
    return { project, notice: [...notices, ...(notice ? [notice] : [])].join(" ") || null };
  };
  if (mediaId && !beginPreparation(project.id, mediaId)) return finish("Não foi possível registrar a preparação neste dispositivo. Seu vídeo foi importado. Você pode editar ou tentar transcrever na visão geral.", "failed");
  if (signal?.aborted) return finish(cancelledNotice, "cancelled");
  let off: (() => void) | undefined;
  let cancelJob: (() => void) | undefined;
  let active = true;
  try {
    if (!mediaId) throw new Error("O vídeo importado não está disponível.");
    onProgress?.(track("checking-transcription"));
    const media = await getMedia(mediaId);
    if (signal?.aborted) return finish(cancelledNotice, "cancelled");
    if (!media || media.unavailable) throw new Error("O vídeo não está disponível no disco.");
    if (!media.analysis?.hasAudio) return finish("Vídeo sem áudio para transcrever. Seu projeto está pronto para edição manual.");
    const status = await transcription.getTranscriptionEngine();
    if (signal?.aborted) return finish(cancelledNotice, "cancelled");
    if (!status.available) return finish("A transcrição local está indisponível. Verifique a instalação do aplicativo e use Verificar novamente na visão geral. Você pode editar o vídeo sem transcrição.", "failed");
    const profile = status.profiles?.find(value => value.id === "turbo" && value.available)?.id
      ?? status.profiles?.find(value => value.available)?.id ?? "turbo";
    const jobId = crypto.randomUUID();
    ownedJobId = jobId;
    if (!beginPreparation(project.id, mediaId, jobId)) return finish("Não foi possível registrar a preparação. Seu projeto está disponível para edição manual.", "failed");
    off = await listen<unknown>("transcription://job", event => {
      const job = event.payload;
      if (!active || signal?.aborted || !transcription.isTranscriptionJob(job) || job.projectId !== project.id || job.jobId !== jobId || job.state !== "running") return;
      onProgress?.(track(job.stage, job.stage === "transcribing" ? job.progress : undefined, job.stage === "transcribing" ? 100 : undefined));
    });
    if (signal?.aborted) return finish(cancelledNotice, "cancelled");
    cancelJob = () => { void transcription.cancelTranscription(jobId).catch(() => {}); };
    signal?.addEventListener("abort", cancelJob, { once: true });
    onProgress?.(track("extracting"));
    const record = await transcription.transcribeProject(project.id, mediaId, jobId, profile, "auto");
    if (signal?.aborted) return finish(cancelledNotice, "cancelled");
    if (record.mediaId !== mediaId) throw new Error("Não foi possível sincronizar a transcrição com o vídeo.");
    onProgress?.(track("saving"));
    const workspace = readWorkspace(project.id);
    if (!saveWorkspace(project.id, { ...workspace, transcript: record.segments, transcriptMode: "real" })) {
      return finish("A transcrição foi processada, mas não foi possível atualizar os dados locais. Reabra o projeto para recuperar o resultado salvo.");
    }
    return finish(record.segments.length ? undefined : "Nenhuma fala foi encontrada. Seu projeto está pronto para edição manual.");
  } catch (error) {
    if (signal?.aborted) return finish(cancelledNotice, "cancelled");
    return finish(`${transcriptionMessage(error)} Seu vídeo e projeto foram mantidos. Você pode editar ou tentar transcrever novamente na visão geral.`, "failed");
  } finally {
    active = false;
    if (cancelJob) signal?.removeEventListener("abort", cancelJob);
    off?.();
  }
}
