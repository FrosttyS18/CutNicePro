import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "../lib/clips";
import type { EditorSettings } from "../lib/workspace-types";

export function useClips(projectId: string, mediaId?: string) {
  const [collection, setCollection] = useState<api.ClipCollection | null>(null);
  const [job, setJob] = useState<api.ClipJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
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

  async function execute(stage: api.ClipJob["stage"], action: (jobId: string) => Promise<api.ClipCollection | boolean>) {
    if (!mediaId || job?.state === "running") return;
    const version = epoch.current;
    const jobId = crypto.randomUUID();
    setError(null); setNotice(null);
    setJob({ jobId, projectId, stage, state: "running", progress: 0, error: null });
    try {
      const result = await action(jobId);
      if (version !== epoch.current) return;
      if (typeof result !== "boolean") setCollection(result);
      if (result === true) setNotice("Vídeo exportado.");
      setJob({ jobId, projectId, stage, state: "completed", progress: result === false ? 0 : 100, error: null });
    } catch (e) {
      if (version !== epoch.current) return;
      const latest = await api.getClipJob().catch(() => null);
      if (version !== epoch.current) return;
      if (api.isClipJob(latest) && latest.jobId === jobId) setJob(latest);
      else setJob({ jobId, projectId, stage, state: "failed", progress: 0, error: String(e) });
    }
  }
  function generate(options: api.ClipOptions) {
    return execute("analyzing", id => api.generateClips(projectId, mediaId!, id, options));
  }
  function analyze(clipId: string) {
    return execute("analyzing",id => api.analyzeClip(projectId,mediaId!,clipId,id));
  }
  function exportVideo(settings: EditorSettings, clipId?: string) {
    return execute("rendering", id => api.exportVideo(projectId, mediaId!, id, settings, clipId));
  }
  async function review(clipId: string, review: api.ClipReview) {
    if (!mediaId) return;
    const version = epoch.current;
    try { const value = await api.reviewClip(projectId, mediaId, clipId, review); if (version === epoch.current) setCollection(value); }
    catch (e) { if (version === epoch.current) setError(api.clipMessage(e)); }
  }
  async function cancel() {
    if (!job) return false;
    try { return await api.cancelClips(job.jobId); }
    catch (e) { setError(api.clipMessage(e)); return false; }
  }
  return { collection, job, busy: job?.state === "running", loading, error, notice, generate, analyze, exportVideo, review, cancel,
    reload: () => setRevision(value => value + 1) };
}
