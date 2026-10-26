import { useEffect, useState } from "react";
import { loadClipLibrary } from "../services/clip-library";
import type { ProjectMeta } from "../lib/types";
import type { LibraryClip } from "../lib/clip-library";

export function useClipLibrary(projects: ProjectMeta[]) {
  const [entries,setEntries] = useState<LibraryClip[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const [partial,setPartial] = useState<string | null>(null);
  const [revision,setRevision] = useState(0);
  useEffect(() => {
    const reload = () => setRevision(value => value + 1);
    window.addEventListener("cnp:editor-saved", reload);
    return () => window.removeEventListener("cnp:editor-saved", reload);
  }, []);
  const [request,setRequest] = useState({projects,revision});
  if (request.projects !== projects || request.revision !== revision) {
    setRequest({projects,revision});
    setLoading(true); setError(null); setPartial(null);
  }
  useEffect(() => {
    let disposed = false;
    void loadClipLibrary(projects).then(({ entries: found, failed }) => {
        if (disposed) return;
        setEntries(found);
        if (failed.length) setPartial(`Alguns projetos não puderam ser carregados (${failed.length}).`);
      })
      .catch(() => { if (!disposed) { setEntries([]); setError("Não foi possível carregar os clipes. Tente novamente."); } })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [projects,revision]);
  return { entries,loading,error,partial,reload: () => setRevision(value => value+1) };
}
