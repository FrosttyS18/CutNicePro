import { useCallback, useEffect, useRef, useState } from "react";
import { saveTranscript, type TranscriptRecord } from "../lib/transcription";
import { useVideoSource } from "./useVideoSource";
import * as ipc from "../lib/ipc";
import {
  attachPersistedMedia,
  attachSessionMedia,
  getSessionMedia,
  readWorkspace,
  saveWorkspace,
} from "../services/workspace-store";
import { createWorkspace } from "../lib/workspace";
import type { UploadSource, WorkspaceData } from "../lib/workspace-types";
import { captureClipEdits } from "../lib/clip-workspace";

export function useWorkspaceData(id: string) {
  const [data, setData] = useState(() => readWorkspace(id));
  const [localUrl, setLocalUrl] = useState(() => getSessionMedia(id));
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [saved,setSaved] = useState(() => JSON.stringify(data));
  const source = useVideoSource();
  const latest = useRef(data);
  latest.current = data;
  const acceptTranscript = useCallback((record: TranscriptRecord) => {
    const current = latest.current;
    if (record.mediaId !== current.media?.mediaId) return;
    const next: WorkspaceData = { ...current, transcript: record.segments, transcriptMode: "real" };
    latest.current = next;
    setData(next);
    if (saveWorkspace(id, next)) setSaved(JSON.stringify(next));
    else setNotice({ text: "Não foi possível atualizar este projeto. Reabra o projeto para continuar.", error: true });
  }, [id]);

  // M2A: workspace com mídia PERSISTENTE (mediaId) reconecta sozinho ao
  // reabrir o projeto — sem reenviar arquivo e sem "Reconectar original".
  // A URL vem do scheme cnplocal (mesma origem do app; canvas ok com ACAO:*).
  useEffect(() => {
    const mediaId = data.media?.mediaId;
    if (!mediaId || localUrl) return;
    let disposed = false;
    void (async () => {
      try {
        const entry = await ipc.getMedia(mediaId);
        if (disposed) return;
        if (!entry || entry.unavailable) {
          setNotice({
            text: entry?.unavailable
              ? "O arquivo de mídia está ausente do disco. Reconecte o vídeo original."
              : "Não foi possível encontrar este vídeo. Importe o arquivo novamente.",
            error: true,
          });
          return;
        }
        const url = ipc.mediaUrl(entry);
        attachPersistedMedia(id, mediaId, url);
        setLocalUrl(url);
      } catch {
        if (!disposed) {
          setNotice({
            text: "Não foi possível abrir este vídeo. Reabra o projeto para tentar novamente.",
            error: true,
          });
        }
      }
    })();
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.media?.mediaId, id]);

  function change(next: WorkspaceData) { setData(captureClipEdits(next)); setNotice(null); }
  async function save() {
    try {
      if (data.transcriptMode === "real" && data.media?.mediaId) {
        await saveTranscript(id, data.media.mediaId, data.transcript);
      }
      if (saveWorkspace(id, data)) {
        setSaved(JSON.stringify(data));
        setNotice(null);
        return true;
      } else setNotice({ text: "Não foi possível salvar suas alterações. Tente novamente.", error: true });
    } catch { setNotice({ text: "Não foi possível salvar suas alterações. Tente novamente.", error: true }); }
    return false;
  }

  function connect(media: UploadSource) {
    const imported = createWorkspace(media, { tool: data.tool, model: data.settings.captionModel, ratio: data.settings.ratio });
    const next: WorkspaceData = { ...imported, settings: { ...data.settings, trimStart: 0, trimEnd: imported.media?.duration ?? null },
      transcript: data.transcript.length ? data.transcript : imported.transcript };
    attachSessionMedia(id, media);
    setLocalUrl(getSessionMedia(id));
    change(next);
    if (saveWorkspace(id, next)) setSaved(JSON.stringify(next));
    else setNotice({ text: "Não foi possível salvar suas alterações. Tente novamente.", error: true });
  }

  async function selectFile(file: File) {
    const loaded = await source.select(file);
    if (loaded) connect({ kind: "local", video: loaded });
  }

  return { data, localUrl, notice, source, dirty: saved !== JSON.stringify(data), change, save, connect, selectFile, acceptTranscript };
}
