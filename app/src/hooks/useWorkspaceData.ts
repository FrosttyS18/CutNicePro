import { useRef, useState } from "react";
import { useVideoSource } from "./useVideoSource";
import { attachSessionMedia, getSessionMedia, readWorkspace, saveWorkspace } from "../services/workspace-store";
import { createWorkspace } from "../lib/workspace";
import type { UploadSource, WorkspaceData } from "../lib/workspace-types";

export function useWorkspaceData(id: string) {
  const [data, setData] = useState(() => readWorkspace(id));
  const [localUrl, setLocalUrl] = useState(() => getSessionMedia(id));
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const saved = useRef(JSON.stringify(data));
  const source = useVideoSource();

  function change(next: WorkspaceData) { setData(next); setNotice(null); }
  function save() {
    if (saveWorkspace(id, data)) {
      saved.current = JSON.stringify(data);
      setNotice({ text: "Configurações salvas neste dispositivo.", error: false });
    } else setNotice({ text: "Não foi possível salvar as configurações. Mantenha o app aberto e tente novamente.", error: true });
  }

  function connect(media: UploadSource) {
    const imported = createWorkspace(media, { tool: data.tool, model: data.settings.captionModel, ratio: data.settings.ratio });
    const next: WorkspaceData = { ...imported, settings: { ...data.settings, trimStart: 0, trimEnd: imported.media?.duration ?? null },
      transcript: data.transcript.length ? data.transcript : imported.transcript };
    attachSessionMedia(id, media);
    setLocalUrl(getSessionMedia(id));
    change(next);
    if (saveWorkspace(id, next)) saved.current = JSON.stringify(next);
    else setNotice({ text: "O vídeo foi conectado à sessão, mas as configurações não puderam ser salvas.", error: true });
  }

  async function selectFile(file: File) {
    const loaded = await source.select(file);
    if (loaded) connect({ kind: "local", video: loaded });
  }

  return { data, localUrl, notice, source, dirty: saved.current !== JSON.stringify(data), change, save, connect, selectFile };
}
