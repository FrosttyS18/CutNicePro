import { useCallback, useEffect, useRef, useState } from "react";
import { inspectLocalVideo, type LocalVideo } from "../lib/video-source";

export function useVideoSource() {
  const [video, setVideo] = useState<LocalVideo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const current = useRef<LocalVideo | null>(null);

  const select = useCallback(async (file: File) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setLoading(true);
    setError(null);
    try {
      const loaded = await inspectLocalVideo(file, next.signal);
      if (next.signal.aborted) {
        URL.revokeObjectURL(loaded.url);
        return null;
      }
      if (current.current) URL.revokeObjectURL(current.current.url);
      current.current = loaded;
      setVideo(loaded);
      return loaded;
    } catch (failure) {
      if (!next.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível ler o vídeo.");
      return null;
    } finally {
      if (!next.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => () => {
    controller.current?.abort();
    if (current.current) URL.revokeObjectURL(current.current.url);
  }, []);

  return { video, loading, error, select, clearError: () => setError(null) };
}
