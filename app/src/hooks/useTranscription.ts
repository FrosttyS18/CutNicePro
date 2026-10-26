import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getMedia } from "../lib/ipc";
import * as engine from "../lib/transcription";
import type { TranscriptRecord, TranscriptionJob } from "../lib/transcription";
import { transcriptionMessage } from "../lib/transcription-feedback";
import { beginPreparation, completePreparation, setPreparationOutcome } from "../services/project-preparation-state";

export function useTranscription(projectId: string, mediaId: string | undefined, onRecord: (record: TranscriptRecord) => void) {
  const [job, setJob] = useState<TranscriptionJob | null>(null);
  const [ready, setReady] = useState(false);
  const [profiles,setProfiles] = useState<NonNullable<engine.TranscriptionEngine["profiles"]>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const epoch = useRef(0);
  const appliedJob = useRef<string | null>(null);
  const receiver = useRef(onRecord);
  const identity = useRef({ projectId, mediaId });
  useLayoutEffect(() => { receiver.current = onRecord; identity.current = { projectId, mediaId }; }, [onRecord,projectId,mediaId]);
  const [request,setRequest] = useState({projectId,mediaId,revision});
  if (request.projectId !== projectId || request.mediaId !== mediaId || request.revision !== revision) {
    setRequest({projectId,mediaId,revision});
    setReady(false); setError(null); setLoaded(false); setJob(null);
  }

  useEffect(() => {
    epoch.current += 1;
    if (!mediaId) return;
    let disposed = false;
    let off: (() => void) | undefined;
    const applyRecord = async (jobId?: string) => {
      const record = await engine.readTranscript(projectId, mediaId);
      if (record && record.mediaId !== mediaId) throw new Error("Não foi possível sincronizar a transcrição com o vídeo.");
      if (!disposed && record && (!jobId || appliedJob.current !== jobId)) {
        if (jobId) appliedJob.current = jobId;
        receiver.current(record);
        if (jobId) completePreparation(projectId, mediaId, jobId);
      }
    };
    void (async () => {
      const stop = await listen<unknown>("transcription://job", event => {
        if (disposed || !engine.isTranscriptionJob(event.payload) || event.payload.projectId !== projectId) return;
        setJob(event.payload);
        if (event.payload.state === "failed" || event.payload.state === "cancelled") setPreparationOutcome(projectId, mediaId, event.payload.jobId, event.payload.state, transcriptionMessage(event.payload.error ?? "Transcrição cancelada"));
        if (event.payload.state === "completed") void applyRecord(event.payload.jobId).catch(e => { if (!disposed) setError(transcriptionMessage(e)); });
      });
      if (disposed) { stop(); return; }
      off = stop;
      const [status, media, active] = await Promise.all([engine.getTranscriptionEngine(), getMedia(mediaId), engine.getTranscriptionJob()]);
      if (disposed) return;
      if (engine.isTranscriptionJob(active) && active.projectId === projectId) setJob(active);
      if (!media || media.unavailable) throw new Error("O vídeo não está disponível no disco.");
      if (!media.analysis?.hasAudio) throw new Error("Este vídeo não tem áudio analisado para transcrever.");
      await applyRecord(engine.isTranscriptionJob(active) && active.projectId === projectId && active.state === "completed" ? active.jobId : undefined);
      if (disposed) return;
      setReady(status.available);
      setProfiles(status.profiles ?? [{id:"turbo",available:status.available}]);
      setError(status.error ? transcriptionMessage(status.error) : null);
      setLoaded(true);
    })().catch(e => { if (!disposed) { setError(transcriptionMessage(e)); setLoaded(true); } });
    return () => { disposed = true; epoch.current += 1; off?.(); };
  }, [projectId, mediaId, revision]);

  async function start(profile: engine.TranscriptionProfile = "turbo",processor: "auto" | "cpu" = "auto") {
    if (!mediaId || !ready || job?.state === "running") return;
    const jobId = crypto.randomUUID();
    const startedEpoch = epoch.current;
    if (!beginPreparation(projectId, mediaId, jobId)) { setError("Não foi possível registrar a preparação. Seu projeto foi mantido. Tente novamente."); return; }
    setError(null);
    setJob({ jobId, projectId, state: "running", stage: "extracting", error: null, progress: 0 });
    try {
      const record = await engine.transcribeProject(projectId, mediaId, jobId,profile,processor);
      if (epoch.current !== startedEpoch) return;
      if (record.mediaId !== mediaId) throw new Error("Não foi possível sincronizar a transcrição com o vídeo.");
      if (appliedJob.current !== jobId) {
        appliedJob.current = jobId;
        receiver.current(record);
      }
      setJob({ jobId, projectId, state: "completed", stage: "saving", error: null, progress: 100 });
      completePreparation(projectId, mediaId, jobId);
    } catch (e) {
      if (epoch.current !== startedEpoch || identity.current.projectId !== projectId || identity.current.mediaId !== mediaId) return;
      const latest = await engine.getTranscriptionJob().catch(() => null);
      if (epoch.current !== startedEpoch) return;
      if (engine.isTranscriptionJob(latest) && latest.jobId === jobId) {
        setJob(latest);
        if (latest.state === "failed" || latest.state === "cancelled") setPreparationOutcome(projectId, mediaId, jobId, latest.state, transcriptionMessage(e));
      }
      else { setJob(null); setError(transcriptionMessage(e)); setPreparationOutcome(projectId, mediaId, jobId, "failed", transcriptionMessage(e)); }
    }
  }

  async function cancel() {
    if (!job) return false;
    try { return await engine.cancelTranscription(job.jobId); }
    catch (e) { setError(transcriptionMessage(e)); return false; }
  }

  return { job, ready, loaded, error, profiles, start, cancel, retry: () => setRevision(v => v + 1), busy: job?.state === "running" };
}
