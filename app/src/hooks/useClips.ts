import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "../lib/clips";
import type { EditorSettings } from "../lib/workspace-types";

/**
 * Resultado real de uma operação (upd 20 — auditoria): sucesso só existe
 * quando o trabalho foi EFETIVAMENTE concluído/persistido; cancelamento do
 * diálogo de destino, cancelamento do processamento, falha, bloqueio de
 * início e abandono por remontagem são estados distintos.
 */
export type ClipOperationResult =
  | { status: "completed" }
  | { status: "dialog-cancelled" }
  | { status: "cancelled" }
  | { status: "failed"; error: string }
  | { status: "blocked" }
  | { status: "abandoned" };

export function useClips(projectId: string, mediaId?: string) {
  const [collection, setCollection] = useState<api.ClipCollection | null>(null);
  const [job, setJob] = useState<api.ClipJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [reviewing,setReviewing] = useState(false);
  const owned = useRef<{id: string; kind: "generate" | "analyze" | "export"} | null>(null);
  const pending = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    epoch.current += 1;
    let disposed = false;
    let off: (() => void) | undefined;
    setCollection(null); setJob(null); setError(null); setNotice(null);
    if (!mediaId) return;
    setLoading(true);
    void (async () => {
      const stop = await listen<unknown>("clips://job", event => {
        if (disposed || !api.isClipJob(event.payload) || event.payload.projectId !== projectId) return;
        setJob(event.payload);
        if (event.payload.state === "completed" && event.payload.stage === "analyzing") {
          void api.getClips(projectId, mediaId).then(value => { if (!disposed) setCollection(value); }).catch(e => { if (!disposed) setError(api.clipMessage(e)); });
        }
      });
      if (disposed) { stop(); return; }
      off = stop;
      const [saved, active] = await Promise.all([api.getClips(projectId, mediaId), api.getClipJob()]);
      if (!disposed) { setCollection(saved); if (api.isClipJob(active) && active.projectId === projectId) setJob(active); }
    })().catch(e => { if (!disposed) setError(api.clipMessage(e)); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; epoch.current += 1; off?.(); };
  }, [projectId, mediaId, revision]);

  async function execute(kind: "generate" | "analyze" | "export", action: (jobId: string) => Promise<api.ClipCollection | boolean>): Promise<ClipOperationResult> {
    if (!mediaId || job?.state === "running" || pending.current) return { status: "blocked" };
    pending.current = true;
    const stage = kind === "export" ? "rendering" : "analyzing";
    const version = epoch.current;
    const jobId = crypto.randomUUID();
    // geração incremental (atualização 19): comparação por ID para informar
    // quantos cortes NOVOS entraram — sem substituir os existentes
    const known = kind === "generate" ? new Set(collection?.clips.map(clip => clip.id) ?? []) : null;
    owned.current = {id:jobId,kind};
    setError(null); setNotice(null);
    setJob({ jobId, projectId, stage, operation:kind, state: "running", progress: 0, error: null });
    try {
      const result = await action(jobId);
      if (version !== epoch.current) return { status: "abandoned" };
      if (typeof result !== "boolean") {
        setCollection(result);
        if (kind === "generate") {
          const added = result.clips.filter(clip => !known?.has(clip.id)).length;
          const total = result.clips.filter(clip => !clip.deleted).length;
          const base = added
            ? `${added} ${added === 1 ? "novo corte adicionado" : "novos cortes adicionados"} — ${total} ${total === 1 ? "corte no total" : "cortes no total"}.`
            : `Nenhum corte novo encontrado — sua biblioteca está mantida com ${total} ${total === 1 ? "corte" : "cortes"}.`;
          const failed = result.clips.filter(clip => clip.analysisError).length;
          setNotice(failed ? `${base} ${failed} ${failed === 1 ? "precisa" : "precisam"} de nova análise.` : base);
        } else {
          const failed=result.clips.filter(clip=>clip.analysisError).length;
          if(failed) setNotice(`${result.clips.length} clipes salvos. ${failed} ${failed === 1 ? "precisa" : "precisam"} de nova análise.`);
        }
      }
      if (result === true) setNotice("Vídeo exportado.");
      setJob({ jobId, projectId, stage, operation:kind, state: "completed", progress: result === false ? 0 : 100, error: null });
      // exportação: false = usuário cancelou o diálogo de destino (nenhum
      // arquivo foi publicado — não é sucesso nem falha de processamento)
      return result === false ? { status: "dialog-cancelled" } : { status: "completed" };
    } catch (e) {
      if (version !== epoch.current) return { status: "abandoned" };
      const latest = await api.getClipJob().catch(() => null);
      if (version !== epoch.current) return { status: "abandoned" };
      const snapshot = api.isClipJob(latest) && latest.jobId === jobId ? latest : null;
      if (snapshot) setJob(snapshot);
      else setJob({ jobId, projectId, stage, operation:kind, state: "failed", progress: 0, error: String(e) });
      if (snapshot?.state === "cancelled") return { status: "cancelled" };
      return { status: "failed", error: snapshot?.error ?? String(e) };
    } finally { pending.current = false; }
  }
  function generate(options: api.ClipOptions) {
    return execute("generate", id => api.generateClips(projectId, mediaId!, id, options));
  }
  function analyze(clipId: string) {
    return execute("analyze",id => api.analyzeClip(projectId,mediaId!,clipId,id));
  }
  function exportVideo(settings: EditorSettings, clipId?: string): Promise<ClipOperationResult> {
    return execute("export", id => api.exportVideo(projectId, mediaId!, id, settings, clipId));
  }
  /** Exclusão recuperável (atualização 19): marca o clipe sem apagar nada. */
  async function remove(clipId: string) {
    if (!mediaId || pending.current || job?.state === "running") return false;
    pending.current = true;
    const version = epoch.current;
    try {
      const value = await api.deleteClip(projectId, mediaId, clipId);
      if (version !== epoch.current) return false;
      setCollection(value); return true;
    } catch { if (version === epoch.current) setError("Não foi possível excluir o clipe. Tente novamente."); return false; }
    finally { pending.current = false; }
  }
  async function restore(clipId: string) {
    if (!mediaId || pending.current || job?.state === "running") return false;
    pending.current = true;
    const version = epoch.current;
    try {
      const value = await api.restoreClip(projectId, mediaId, clipId);
      if (version !== epoch.current) return false;
      setCollection(value); return true;
    } catch { if (version === epoch.current) setError("Não foi possível restaurar o clipe. Tente novamente."); return false; }
    finally { pending.current = false; }
  }
  async function review(clipId: string, review: api.ClipReview) {
    if (!mediaId || pending.current || job?.state === "running") return false;
    pending.current = true; setReviewing(true); setError(null);
    const version = epoch.current;
    try {
      const value = await api.reviewClip(projectId, mediaId, clipId, review);
      if (version !== epoch.current) return false;
      setCollection(value); return true;
    } catch { if (version === epoch.current) setError("Não foi possível salvar a revisão do clipe. Tente novamente."); return false; }
    finally { pending.current = false; if (version === epoch.current) setReviewing(false); }
  }
  async function cancel() {
    if (!job) return false;
    try { return await api.cancelClips(job.jobId); }
    catch (e) { setError(api.clipMessage(e)); return false; }
  }
  return { collection, job, ownedJob:owned.current?.id === job?.jobId && owned.current !== null,
    operation: job?.operation ?? (owned.current && owned.current.id === job?.jobId ? owned.current.kind : null),
    busy: job?.state === "running" || reviewing, loading, error, notice, generate, analyze, exportVideo, review, remove, restore, cancel,
    reload: () => setRevision(value => value + 1) };
}
