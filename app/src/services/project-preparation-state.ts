import { getTranscriptionJob, isTranscriptionJob } from "../lib/transcription";

export interface ProjectPreparation {
  version: 1;
  state: "running" | "interrupted" | "failed" | "cancelled";
  mediaId: string;
  jobId: string | null;
  updatedAtMs: number;
  message: string | null;
}
const key = (id: string) => `cnp.preparation.v1.${id}`;
function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new window.Event("cnp:preparation-changed"));
}
export function readPreparation(projectId: string): ProjectPreparation | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error();
    const record = value as Partial<ProjectPreparation>;
    if (record.version !== 1 || !["running", "interrupted", "failed", "cancelled"].includes(record.state ?? "")
      || typeof record.mediaId !== "string" || !record.mediaId || record.jobId !== null && typeof record.jobId !== "string"
      || typeof record.updatedAtMs !== "number" || !Number.isSafeInteger(record.updatedAtMs) || record.updatedAtMs <= 0
      || record.message !== null && typeof record.message !== "string") throw new Error();
    return record as ProjectPreparation;
  } catch {
    throw new Error("Não foi possível ler o registro de preparação. Seu vídeo e projeto foram mantidos.");
  }
}
function write(projectId: string, record: ProjectPreparation): boolean {
  try { localStorage.setItem(key(projectId), JSON.stringify(record)); notify(); return true; }
  catch { return false; }
}
export function beginPreparation(projectId: string, mediaId: string, jobId: string | null = null): boolean {
  return write(projectId, { version: 1, state: "running", mediaId, jobId, updatedAtMs: Date.now(), message: null });
}
export function setPreparationOutcome(projectId: string, mediaId: string, jobId: string | null, state: "interrupted" | "failed" | "cancelled", message: string): boolean {
  try {
    const record = readPreparation(projectId);
    if (!record || record.mediaId !== mediaId || record.jobId !== jobId) return false;
    return write(projectId, { ...record, state, message, updatedAtMs: Date.now() });
  } catch { return false; }
}
export function removeProjectPreparation(projectId: string): void {
  localStorage.removeItem(key(projectId));
  notify();
}
export function completePreparation(projectId: string, mediaId: string, jobId: string | null = null): boolean {
  try {
    const record = readPreparation(projectId);
    if (!record) return true;
    if (record.mediaId !== mediaId || record.jobId !== jobId) return false;
    removeProjectPreparation(projectId);
    return true;
  } catch { return false; }
}
export async function reconcilePreparations(projectIds: string[]): Promise<{ interrupted: number; failed: string[] }> {
  const failed: string[] = [];
  const candidates: { id: string; record: ProjectPreparation }[] = [];
  for (const id of projectIds) {
    try { const record = readPreparation(id); if (record?.state === "running") candidates.push({ id, record }); }
    catch { failed.push(id); }
  }
  if (!candidates.length) return { interrupted: 0, failed };
  let active: unknown;
  try { active = await getTranscriptionJob(); }
  catch { return { interrupted: 0, failed: [...failed, ...candidates.map(value => value.id)] }; }
  if (active !== null && !isTranscriptionJob(active)) return { interrupted: 0, failed: [...failed, ...candidates.map(value => value.id)] };
  let interrupted = 0;
  for (const { id, record } of candidates) {
    if (isTranscriptionJob(active) && active.state === "running" && active.projectId === id && active.jobId === record.jobId) continue;
    if (setPreparationOutcome(id, record.mediaId, record.jobId, "interrupted", "A preparação foi interrompida antes de terminar. Seu vídeo foi mantido. Use Transcrever para retomar, ou continue editando.")) interrupted += 1;
    else failed.push(id);
  }
  return { interrupted, failed };
}
