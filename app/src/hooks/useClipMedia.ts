import { useEffect,useState } from "react";
import { loadClipMedia,type ClipMedia } from "../services/clip-media";

export function useClipMedia(projectId: string,mediaId: string) {
  const [source,setSource] = useState<ClipMedia | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [request,setRequest] = useState({projectId,mediaId});
  if (request.projectId !== projectId || request.mediaId !== mediaId) {
    setRequest({projectId,mediaId});
    setSource(null); setError(null);
  }
  useEffect(() => {
    let disposed = false;
    void loadClipMedia(projectId,mediaId).then(value => { if (!disposed) setSource(value); })
      .catch(() => { if (!disposed) setError("Não foi possível carregar este clipe. Reabra o projeto e reconecte o vídeo original."); });
    return () => { disposed = true; };
  }, [projectId,mediaId]);
  return { source,error,loading:!source && !error };
}
