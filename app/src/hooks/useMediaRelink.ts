import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { relinkMedia } from "../lib/ipc";
import type { MediaKind } from "../lib/composition-types";
import { notifyMediaRelinked } from "../services/media-relink-events";
import { MEDIA_FILE_EXTENSIONS } from "../lib/media-file-types";

export function useMediaRelink(projectId: string, mediaId: string, kind: MediaKind) {
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, [projectId, mediaId]);
  const locate = async () => {
    if (controller.current) return;
    const operation = new AbortController(); controller.current = operation;
    try {
      const path = await open({ multiple: false, directory: false, filters: [{ name: "Arquivo original", extensions: MEDIA_FILE_EXTENSIONS[kind] }] });
      if (typeof path !== "string" || operation.signal.aborted) return;
      setBusy(true); setNotice(null); setProgress(null);
      await relinkMedia(projectId, mediaId, path, (completed, total) => {
        if (controller.current === operation && !operation.signal.aborted) setProgress({ completed, total });
      }, operation.signal);
      if (controller.current !== operation) return;
      notifyMediaRelinked(mediaId);
      setNotice({ text: "Arquivo original reconectado. Suas edições foram preservadas.", error: false });
    } catch (error) {
      if (controller.current === operation && !operation.signal.aborted) setNotice({ text: error instanceof Error ? error.message : typeof error === "string" ? error : "Não foi possível reconectar o arquivo original.", error: true });
    } finally {
      if (controller.current === operation) { controller.current = null; setBusy(false); setProgress(null); }
    }
  };
  return { locate, busy, progress, notice, cancel: () => controller.current?.abort() };
}
