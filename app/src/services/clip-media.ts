import { getMedia,mediaUrl } from "../lib/ipc";
import { readTranscript } from "../lib/transcription";
import type { SourceDescriptor,TranscriptSegment } from "../lib/workspace-types";
import { readWorkspace,saveWorkspace } from "./workspace-store";
import { type Clip } from "../lib/clips";
import { openClipWorkspace } from "../lib/clip-workspace";

export interface ClipMedia { media: SourceDescriptor; url: string; transcript: TranscriptSegment[] }
export async function loadClipMedia(projectId: string,mediaId: string): Promise<ClipMedia> {
  const [entry,record] = await Promise.all([getMedia(mediaId),readTranscript(projectId,mediaId)]);
  if (!entry || entry.unavailable || !entry.projectIds.includes(projectId) || !entry.analysis) throw new Error("O vídeo deste clipe está indisponível. Reconecte o arquivo original no projeto.");
  return { media:{kind:"local",mediaId,name:entry.originalName,videoId:null,url:null,width:entry.analysis.width,height:entry.analysis.height,duration:entry.analysis.durationMs/1000},
    url:mediaUrl(entry),transcript:record?.segments ?? [] };
}
export async function prepareClipEditing(projectId: string,mediaId: string,clip: Clip): Promise<void> {
  const source = await loadClipMedia(projectId,mediaId).catch(() => { throw new Error("Não foi possível abrir este clipe. Reabra o projeto e reconecte o vídeo original."); });
  const data = readWorkspace(projectId);
  if (clip.end > (source.media.duration ?? 0)) throw new Error("O intervalo deste clipe não está disponível. Atualize os cortes e tente novamente.");
  if (!saveWorkspace(projectId,openClipWorkspace({...data,media:source.media,transcript:source.transcript,transcriptMode:source.transcript.length ? "real" : "empty"},clip))) throw new Error("Não foi possível abrir o clipe para edição. Tente novamente.");
}
