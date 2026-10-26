import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCompositionExport } from "../../hooks/useCompositionExport";
import { clipMessage } from "../../lib/clips";
import type { LibraryClip } from "../../lib/clip-library";
import { ProcessingDialog } from "../workspace/ProcessingDialog";

interface Props { entry: LibraryClip; onClose: () => void; onChanged?: (notice?: string) => void }
export function SavedClipDownload({ entry, onClose, onChanged }: Props) {
  const exporter = useCompositionExport(entry.project.id);
  const { exportDocument } = exporter;
  const lifetime = useRef({ generation: 0, active: false });
  const latest = useRef({ entry, onClose, onChanged });
  useLayoutEffect(() => { latest.current = { entry, onClose, onChanged }; }, [entry, onClose, onChanged]);
  const identity = `${entry.project.id}:${entry.clip.id}:${entry.composition!.document.revision}`;
  const [failure, setFailure] = useState<string | null>(null);
  const start = useCallback(async (generation = lifetime.current.generation) => {
    if (!lifetime.current.active || lifetime.current.generation !== generation) return;
    setFailure(null);
    const current = latest.current.entry;
    const result = await exportDocument(current.composition!.document, current.clip.id);
    if (!lifetime.current.active || lifetime.current.generation !== generation) return;
    if (result.status === "completed") { latest.current.onChanged?.("Vídeo exportado."); latest.current.onClose(); }
    else if (result.status === "dialog-cancelled" || result.status === "cancelled") { latest.current.onChanged?.(); latest.current.onClose(); }
    else if (result.status === "abandoned") return;
    else if (result.status === "failed") setFailure(clipMessage(result.error));
    else setFailure("Há um processamento em andamento. Aguarde antes de baixar este clipe.");
  }, [exportDocument]);
  useEffect(() => {
    const state = lifetime.current;
    const generation = ++state.generation;
    state.active = true;
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) void start(generation); });
    return () => { cancelled = true; if (state.generation === generation) { state.active = false; state.generation += 1; } };
  }, [identity, start]);
  return <>
    {failure && <div className="clip-download__problem" role="alert"><p>{failure}</p>
      <button type="button" className="flow-button" onClick={() => void start()}>Tentar novamente</button>
      <button type="button" className="flow-button" onClick={onClose}>Fechar</button></div>}
    {!failure && exporter.job && <ProcessingDialog key={exporter.job.jobId} id={exporter.job.jobId} open={exporter.busy || exporter.job.state === "failed"} busy={exporter.busy}
      title="Baixando clipe…" status="Preparando sua montagem" progress={exporter.job.progress} error={clipMessage(exporter.job.error)}
      cancelAction="Cancelar download" cancelDescription="Sua montagem salva será mantida." onCancel={exporter.cancel} onRetry={() => void start()} onClose={onClose} />}
  </>;
}
