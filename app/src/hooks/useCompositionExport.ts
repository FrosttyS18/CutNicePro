import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { exportEditorDocument } from "../lib/ipc";
import { cancelClips, clipMessage, getClipJob, isClipJob, type ClipJob } from "../lib/clips";
import type { ExportReceipt, ExportRequest } from "../lib/composition-export";
import type { Composition } from "../lib/composition-types";
import type { ClipOperationResult } from "./useClips";

export type CompositionExportResult = ClipOperationResult;

interface ExportOperation {
  id: string;
  projectId: string;
  epoch: number;
  started: boolean;
  cancelBeforeStart: boolean;
  job: ClipJob | null;
  stop?: () => void;
}
interface ExportState {
  receipt: ExportReceipt | null;
  projectId: string;
  busy: boolean;
  job: ClipJob | null;
  error: string | null;
}
function stopListening(operation: ExportOperation) {
  const stop = operation.stop;
  operation.stop = undefined;
  stop?.();
}

export function useCompositionExport(projectId: string) {
  const identity = useRef({ projectId, epoch: 0, mounted: false });
  const owned = useRef<ExportOperation | null>(null);
  const [state, setState] = useState<ExportState>({ projectId, busy: false, job: null, error: null, receipt: null });

  useLayoutEffect(() => {
    identity.current = { projectId, epoch: identity.current.epoch + 1, mounted: true };
    setState({ projectId, busy: false, job: null, error: null, receipt: null });
    return () => {
      identity.current.mounted = false;
      identity.current.epoch += 1;
      if (owned.current) stopListening(owned.current);
      owned.current = null;
    };
  }, [projectId]);

  const isCurrent = useCallback((operation: ExportOperation) => identity.current.mounted
    && identity.current.projectId === operation.projectId && identity.current.epoch === operation.epoch
    && owned.current === operation, []);

  const exportDocument = useCallback(async (document: Composition, clipId: string | null = null, request?: ExportRequest): Promise<CompositionExportResult> => {
    if (!identity.current.mounted || identity.current.projectId !== projectId) return { status: "abandoned" };
    if (owned.current) return { status: "blocked" };
    const operation: ExportOperation = { id: crypto.randomUUID(), projectId, epoch: identity.current.epoch,
      started: false, cancelBeforeStart: false, job: null };
    owned.current = operation;
    const initial: ClipJob = { jobId: operation.id, projectId, state: "running", stage: "rendering", operation: "export", progress: 0, error: null };
    setState({ projectId, busy: true, job: initial, error: null, receipt: null });
    const fail = (error: unknown, job: ClipJob | null): CompositionExportResult => {
      const message = clipMessage(error);
      setState({ projectId, busy: true, job: { ...(job ?? initial), state: "failed", error: message }, error: message, receipt: null });
      return { status: "failed", error: message };
    };
    const cancelled = (job: ClipJob | null): CompositionExportResult => {
      setState({ projectId, busy: true, job: { ...(job ?? initial), state: "cancelled", error: null }, error: null, receipt: null });
      return { status: "cancelled" };
    };
    try {
      const snapshot = structuredClone(document);
      const settings = request ? structuredClone(request) : undefined;
      operation.stop = await listen<unknown>("clips://job", event => {
        const job = event.payload;
        if (!isCurrent(operation) || !isClipJob(job) || job.projectId !== projectId || job.jobId !== operation.id
          || job.stage !== "rendering" || job.operation !== undefined && job.operation !== "export"
          || operation.job && operation.job.state !== "running") return;
        operation.job = { ...job };
        setState(current => ({ ...current, job: operation.job }));
      });
      if (!isCurrent(operation)) return { status: "abandoned" };
      if (operation.cancelBeforeStart) return cancelled(null);
      operation.started = true;
      const result = settings
        ? await exportEditorDocument(projectId, clipId, operation.id, snapshot, settings)
        : await exportEditorDocument(projectId, clipId, operation.id, snapshot);
      if (!isCurrent(operation)) return { status: "abandoned" };
      if (operation.job?.state === "cancelled") return cancelled(operation.job);
      if (operation.job?.state === "failed") return fail(operation.job.error, operation.job);
      if (!result) {
        setState({ projectId, busy: true, job: null, error: null, receipt: null });
        return { status: "dialog-cancelled" };
      }
      setState({ projectId, busy: true, job: { ...(operation.job ?? initial), state: "completed", progress: 100, error: null }, error: null, receipt: result });
      return { status: "completed" };
    } catch (error) {
      if (!isCurrent(operation)) return { status: "abandoned" };
      let job = operation.job;
      if (operation.started && job?.state !== "cancelled" && job?.state !== "failed") {
        const latest = await getClipJob().catch(() => null);
        if (!isCurrent(operation)) return { status: "abandoned" };
        if (isClipJob(latest) && latest.projectId === projectId && latest.jobId === operation.id) job = latest;
      }
      if (job?.state === "cancelled") return cancelled(job);
      return fail(job?.state === "failed" && job.error ? job.error : error, job);
    } finally {
      stopListening(operation);
      if (isCurrent(operation)) {
        owned.current = null;
        setState(current => ({ ...current, busy: false }));
      }
    }
  }, [isCurrent, projectId]);

  const cancel = useCallback(async (): Promise<boolean> => {
    const operation = owned.current;
    if (!operation || !isCurrent(operation)) return false;
    if (!operation.started) { operation.cancelBeforeStart = true; return true; }
    try {
      const result = await cancelClips(operation.id);
      return isCurrent(operation) && result;
    } catch (error) {
      if (isCurrent(operation)) setState(current => ({ ...current, error: clipMessage(error) }));
      return false;
    }
  }, [isCurrent]);

  const current = state.projectId === projectId ? state : { job: null, busy: false, error: null, receipt: null };
  return { receipt: current.receipt, job: current.job, busy: current.busy, error: current.error, exportDocument, cancel };
}
