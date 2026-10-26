import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompositionSession } from "../lib/composition-session";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { applyCaptionTranscript, hasCaptionTranscriptUpdate } from "../lib/composition-captions";
import { compositionPersistence, loadEditorState, loadRecovery, type EditorRecovery, type EditorTarget } from "../lib/composition-persistence";
import * as ipc from "../lib/ipc";
import type { Composition } from "../lib/composition-types";
import type { WorkspaceData } from "../lib/workspace-types";
import type { CaptionStyle } from "../lib/captions";
import type { Clip } from "../lib/clips";
import { prepareCaptionBatch } from "../lib/composition-batch";
import type { EditorProjectState } from "../lib/composition-persistence";

interface State {
  key: string;
  session: CompositionSession | null;
  recovery: EditorRecovery | null;
  loading: boolean;
  error: string | null;
  baseClips: EditorProjectState["clips"];
}

export function useCompositionEditor(target: EditorTarget, legacy: WorkspaceData) {
  const [retry, setRetry] = useState(0);
  const key = `${target.projectId}:${target.clipId ?? "project"}:${retry}`;
  const [state, setState] = useState<State>({ key, session: null, recovery: null, loading: true, error: null, baseClips: {} });
  const [, update] = useState(0);
  const legacyRef = useRef(legacy);
  useEffect(() => { legacyRef.current = legacy; }, [legacy]);
  const { projectId, clipId } = target;

  useEffect(() => {
    let cancelled = false;
    const incoming = legacyRef.current;
    const metadata = incoming.media?.mediaId ? ipc.getMedia(incoming.media.mediaId).catch(() => null) : Promise.resolve(null);
    const recoveryResult=loadRecovery({projectId,clipId}).then(value=>({value,error:null as string|null})).catch((error:unknown)=>({value:null,error:error instanceof Error?error.message:typeof error==="string"?error:"Não foi possível ler a recuperação"}));
    void Promise.all([loadEditorState(projectId), recoveryResult, metadata]).then(([saved, recovered, media]) => {
      if (cancelled) return;
      const entry = clipId ? saved.clips[clipId] : saved.project;
      const analyzed = media?.analysis && incoming.media ? {
        ...incoming, media: { ...incoming.media, duration: media.analysis.durationMs / 1000, width: media.analysis.width, height: media.analysis.height },
      } : incoming;
      const document = entry?.document ?? compositionFromLegacy(analyzed, media?.analysis ?? undefined);
      const session = new CompositionSession(document, compositionPersistence({ projectId, clipId }));
      setState({ key, session, recovery:recovered.value, loading: false, error: recovered.error, baseClips: saved.clips });
    }).catch((error: unknown) => {
      if (!cancelled) setState({ key, session: null, recovery: null, loading: false, error: error instanceof Error ? error.message : typeof error === "string" && error.trim() ? error : "Não foi possível abrir a montagem", baseClips: {} });
    });
    return () => { cancelled = true; };
  }, [key, projectId, clipId]);

  const session = state.key === key ? state.session : null;
  const document = session?.document ?? null;
  const dirty = session?.dirty ?? false;
  const revision = session?.savedDocument.revision ?? 0;
  const recoveryRelated = session?.recoveryRelated;
  const activeSession = useRef(session);
  useEffect(() => { activeSession.current = session; return () => { if (activeSession.current === session) activeSession.current = null; }; }, [session]);
  const refresh = useCallback(() => update(value => value + 1), []);
  const report = useCallback((error: unknown) => setState(current => ({ ...current, error: error instanceof Error ? error.message : typeof error === "string" && error.trim() ? error : "Não foi possível alterar a montagem" })), []);

  useEffect(() => {
    if (!document || !dirty) return;
    let active = true;
    const timer = setTimeout(() => {
      const pending = recoveryRelated?.length ? ipc.saveEditorRecovery(projectId, clipId, document, revision, recoveryRelated) : ipc.saveEditorRecovery(projectId, clipId, document, revision);
      void pending.catch(error => { if (active) report(error); });
    }, 1200);
    return () => { active = false; clearTimeout(timer); };
  }, [document, dirty, revision, projectId, clipId, report, recoveryRelated]);

  const apply = useCallback((next: Composition) => {
    if (!session) return false;
    try {
      session.apply(next);
      setState(current => ({ ...current, error: null }));
      refresh();
      return true;
    } catch (error) { report(error); return false; }
  }, [session, refresh, report]);

  const canApplyCaptions = useMemo(() => Boolean(document && legacy.transcriptMode === "real" && legacy.media?.mediaId
    && hasCaptionTranscriptUpdate(document, legacy.media.mediaId, legacy.transcript)), [document, legacy.media, legacy.transcriptMode, legacy.transcript]);
  const applyCaptions = useCallback(() => {
    const incoming = legacyRef.current;
    if (!session || incoming.transcriptMode !== "real" || !incoming.media?.mediaId) return false;
    try { return apply(applyCaptionTranscript(session.document, incoming.media.mediaId, incoming.transcript)); }
    catch (error) { report(error); return false; }
  }, [session, apply, report]);

  const applyAllCaptions = useCallback(async (clips: Clip[], model: number, style: CaptionStyle) => {
    if (!session || session.saving) return false;
    try {
      const saved = await loadEditorState(projectId);
      if (activeSession.current !== session) return false;
      const known = new Set(session.relatedDocuments.map(draft => draft.clipId));
      const needsSource = clips.some(clip => clip.id !== clipId && !known.has(clip.id) && !saved.clips[clip.id]);
      const mediaId = legacyRef.current.media?.mediaId;
      const source = needsSource && mediaId ? await ipc.getMedia(mediaId) : null;
      if (activeSession.current !== session) return false;
      session.applyBatch(prepareCaptionBatch({ activeClipId: clipId, document: session.document, related: session.relatedDocuments, saved, clips, legacy: legacyRef.current, source, model, style }));
      setState(current => ({ ...current, error: null })); refresh(); return true;
    } catch (error) { if (activeSession.current === session) report(error); return false; }
  }, [session, projectId, clipId, refresh, report]);

  const save = useCallback(async () => {
    if (!session) return false;
    const pending = session.save();
    refresh();
    const ok = await pending;
    refresh();
    if (!ok) { report(session.error); return false; }
    if (!session.dirty) {
      try { await ipc.discardEditorRecovery(projectId, clipId); }
      catch (error) { report(error); }
    }
    window.dispatchEvent(new window.CustomEvent("cnp:editor-saved", { detail: { projectId, clipId, revision: session.savedDocument.revision } }));
    return true;
  }, [session, projectId, clipId, refresh, report]);

  const undo = useCallback(() => { session?.undo(); refresh(); }, [session, refresh]);
  const redo = useCallback(() => { session?.redo(); refresh(); }, [session, refresh]);
  const discard = useCallback(async () => {
    try {
      await ipc.discardEditorRecovery(projectId, clipId);
      session?.discard();
      refresh();
      setState(current => ({ ...current, recovery: null, error: null }));
      return true;
    } catch (error) { report(error); return false; }
  }, [session, projectId, clipId, refresh, report]);

  const hasUnsavedChanges = useCallback(() => Boolean(session?.dirty || session?.saving), [session]);
  const dismissError = useCallback(() => setState(current => ({ ...current, error: null })), []);
  const readSavedDocument = useCallback(() => session ? structuredClone(session.savedDocument) : null, [session]);
  const saveForExport = useCallback(async () => {
    if (!session || !await save()) return null;
    if (session.dirty || session.saving) {
      report("Há alterações feitas durante o salvamento. Salve novamente antes de exportar.");
      return null;
    }
    return structuredClone(session.savedDocument);
  }, [session, save, report]);

  const restore = useCallback(() => {
    if (!session || !state.recovery) return;
    try {
      const related = (state.recovery.related ?? []).map(draft => {
        const saved = state.baseClips[draft.clipId];
        if ((saved?.document.revision ?? 0) !== draft.expectedRevision) throw new Error("Um corte do lote foi atualizado. A recuperação foi preservada; reabra o projeto antes de restaurar.");
        return { ...draft, baseDocument: draft.baseDocument ?? saved?.document };
      });
      session.restoreRecovery(state.recovery.document, state.recovery.baseRevision, related);
      setState(current => ({ ...current, recovery: null, error: null }));
      refresh();
    } catch (error) { report(error); }
  }, [session, state.recovery, state.baseClips, refresh, report]);

  return { document, savedDocument: session?.savedDocument ?? null, dirty, saving: session?.saving ?? false,
    canUndo: session?.canUndo ?? false, canRedo: session?.canRedo ?? false,
    loading: state.key !== key || state.loading, error: state.error, recovery: state.recovery,
    apply, canApplyCaptions, applyCaptions, applyAllCaptions, dismissError, save, saveForExport, readSavedDocument, hasUnsavedChanges, undo, redo, discard, restore, retry: () => setRetry(value => value + 1) };
}
