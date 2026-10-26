import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type MediaImportPhase = "hashing" | "analyzing" | "registering";
export type MediaFileProgress = (completed: number, total: number, phase?: MediaImportPhase) => void;

export async function runMediaFileJob(command: "import_media" | "relink_media", args: Record<string, unknown>, onProgress: MediaFileProgress, signal?: AbortSignal): Promise<unknown> {
  const checkCancelled = () => {
    if (signal?.aborted) throw new DOMException("Importação cancelada.", "AbortError");
  };
  checkCancelled();
  const jobId = crypto.randomUUID();
  let active = true;
  let cancellationError: unknown;
  let registrationSeen = false;
  const requestCancel = () => {
    void invoke<boolean>("cancel_import", { jobId }).catch((error: unknown) => { cancellationError = error; });
  };
  const un = await listen<{ jobId: string; bytesCopied?: number; bytesProcessed?: number; totalBytes: number; phase?: MediaImportPhase }>("import://progress", event => {
    const progress = event.payload;
    if (!active || progress.jobId !== jobId) return;
    if (signal?.aborted) {
      if (!registrationSeen) requestCancel();
    } else {
      const completed = progress.bytesProcessed ?? progress.bytesCopied;
      const total = progress.totalBytes;
      if (typeof completed === "number" && Number.isFinite(completed) && Number.isFinite(total) && completed >= 0 && completed <= total) {
        const phase = progress.phase;
        if (phase === "hashing" || phase === "analyzing" || phase === "registering") onProgress(completed, total, phase);
        else onProgress(completed, total);
      }
    }
    registrationSeen = true;
  });
  try {
    checkCancelled();
    signal?.addEventListener("abort", requestCancel, { once: true });
    const raw: unknown = await invoke(command, { ...args, jobId });
    return raw;
  } catch (error) {
    if (cancellationError) throw Object.assign(new Error(`Falha ao solicitar cancelamento: ${String(cancellationError)}`), { cause: error });
    checkCancelled();
    throw error;
  } finally {
    active = false;
    signal?.removeEventListener("abort", requestCancel);
    un();
  }
}
