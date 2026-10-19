import { useEffect, useState } from "react";
import { loadClipLibrary } from "../services/clip-library";
import type { ProjectMeta } from "../lib/types";
import type { LibraryClip } from "../lib/clip-library";

export function useClipLibrary(projects: ProjectMeta[]) {
  const [entries,setEntries] = useState<LibraryClip[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const [revision,setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setError(null);
    void loadClipLibrary(projects).then(found => { if (!disposed) setEntries(found); })
      .catch(() => { if (!disposed) { setEntries([]); setError("Não foi possível carregar os clipes. Tente novamente."); } })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [projects,revision]);
  return { entries,loading,error,reload: () => setRevision(value => value+1) };
}
