import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getEditorTranscriptionJob, isEditorTranscriptionJob, readEditorTranscript, transcribeEditorMedia, type EditorTranscriptionJob } from "../lib/editor-transcription";
import { cancelTranscription, getTranscriptionEngine, type TranscriptRecord, type TranscriptionEngine, type TranscriptionProfile } from "../lib/transcription";
import { transcriptionMessage } from "../lib/transcription-feedback";

interface State {
  projectId: string;
  job: EditorTranscriptionJob | null;
  engine: TranscriptionEngine | null;
  loaded: boolean;
  starting: boolean;
  error: string | null;
  records: Record<string, TranscriptRecord | null>;
  recordLoading: Record<string, boolean>;
  recordErrors: Record<string, string>;
}
const initial = (projectId: string): State => ({ projectId, job: null, engine: null, loaded: false, starting: false, error: null, records: {}, recordLoading: {}, recordErrors: {} });

export function useEditorTranscription(projectId: string, mediaId?: string) {
  const [state, setState] = useState(() => initial(projectId));
  const [revision, setRevision] = useState(0);
  const scope = useRef(projectId);
  const epoch = useRef(0);
  const job = useRef<EditorTranscriptionJob | null>(null);
  const starting = useRef(false);
  const reads = useRef(new Map<string, number>());
  const retired = useRef(new Set<string>());
  useLayoutEffect(() => { scope.current = projectId; }, [projectId]);
  const update = useCallback((change: (current: State) => State) => {
    setState(current => scope.current === projectId ? change(current.projectId === projectId ? current : initial(projectId)) : current);
  }, [projectId]);

  const read = useCallback(async (id: string, token: number) => {
    const sequence = (reads.current.get(id) ?? 0) + 1;
    reads.current.set(id, sequence);
    update(current => ({ ...current, recordLoading: { ...current.recordLoading, [id]: true }, recordErrors: { ...current.recordErrors, [id]: "" } }));
    try {
      const record = await readEditorTranscript(projectId, id);
      if (scope.current !== projectId || epoch.current !== token || reads.current.get(id) !== sequence) return;
      update(current => ({ ...current, records: { ...current.records, [id]: record } }));
    } catch (error) {
      if (scope.current === projectId && epoch.current === token && reads.current.get(id) === sequence) {
        update(current => ({ ...current, recordErrors: { ...current.recordErrors, [id]: transcriptionMessage(error) } }));
      }
    } finally {
      if (scope.current === projectId && epoch.current === token && reads.current.get(id) === sequence) {
        update(current => ({ ...current, recordLoading: { ...current.recordLoading, [id]: false } }));
      }
    }
  }, [projectId, update]);

  const accept = useCallback((next: EditorTranscriptionJob, token: number) => {
    if (scope.current !== projectId || epoch.current !== token || next.projectId !== projectId || retired.current.has(next.jobId)) return;
    const previous = job.current;
    if (previous?.jobId === next.jobId && (previous.state !== "running" && next.state === "running" || previous.progress > next.progress && next.state === "running")) return;
    if (previous?.state === "running" && previous.jobId !== next.jobId) return;
    if (previous && previous.jobId !== next.jobId) retired.current.add(previous.jobId);
    job.current = next;
    update(current => ({ ...current, job: next }));
    if (next.state === "completed") void read(next.mediaId, token);
  }, [projectId, update, read]);

  useEffect(() => {
    const token = ++epoch.current;
    let disposed = false;
    let off: (() => void) | undefined;
    job.current = null;
    starting.current = false;
    reads.current.clear();
    retired.current.clear();
    update(() => initial(projectId));
    void (async () => {
      const stop = await listen<unknown>("editor-transcription-progress", event => {
        if (!disposed && isEditorTranscriptionJob(event.payload)) accept(event.payload, token);
      });
      if (disposed) { stop(); return; }
      off = stop;
      const [engine, active] = await Promise.all([getTranscriptionEngine(), getEditorTranscriptionJob(projectId)]);
      if (disposed || scope.current !== projectId || epoch.current !== token) return;
      update(current => ({ ...current, engine, loaded: true, error: engine.error ? transcriptionMessage(engine.error) : null }));
      if (active) accept(active, token);
    })().catch(error => {
      if (!disposed && epoch.current === token) update(current => ({ ...current, loaded: true, error: transcriptionMessage(error) }));
    });
    return () => { disposed = true; if (epoch.current === token) epoch.current += 1; off?.(); };
  }, [projectId, revision, accept, update]);

  useEffect(() => {
    if (mediaId) void read(mediaId, epoch.current);
  }, [mediaId, projectId, revision, read]);

  async function start(profile: TranscriptionProfile, executionMode: "auto" | "cpu") {
    if (!mediaId || starting.current || job.current?.state === "running" || !state.engine?.available || !state.loaded) return;
    const token = epoch.current;
    starting.current = true;
    if (job.current) retired.current.add(job.current.jobId);
    update(current => ({ ...current, starting: true, error: null }));
    try { accept(await transcribeEditorMedia(projectId, mediaId, profile, executionMode), token); }
    catch (error) {
      if (scope.current === projectId && epoch.current === token) update(current => ({ ...current, error: transcriptionMessage(error) }));
    } finally {
      if (scope.current === projectId && epoch.current === token) {
        starting.current = false;
        update(current => ({ ...current, starting: false }));
      }
    }
  }
  async function cancel() {
    const active = job.current;
    if (!active || active.state !== "running") return false;
    try { return await cancelTranscription(active.jobId); }
    catch (error) { update(current => ({ ...current, error: transcriptionMessage(error) })); return false; }
  }
  const current = state.projectId === projectId ? state : initial(projectId);
  return {
    job: current.job, ready: current.loaded && Boolean(current.engine?.available), loaded: current.loaded,
    profiles: current.engine?.profiles ?? [{ id: "turbo" as const, available: Boolean(current.engine?.available) }],
    record: mediaId ? current.records[mediaId] ?? null : null,
    recordLoading: mediaId ? Boolean(current.recordLoading[mediaId]) : false,
    recordReady: Boolean(mediaId && current.records[mediaId] !== undefined && !current.recordLoading[mediaId] && !current.recordErrors[mediaId]),
    error: current.error || (mediaId ? current.recordErrors[mediaId] : null),
    busy: current.starting || current.job?.state === "running", start, cancel,
    retry: () => setRevision(value => value + 1),
  };
}
