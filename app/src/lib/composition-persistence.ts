import * as ipc from "./ipc";
import { parseComposition } from "./composition-boundary";
import { isRecord } from "./editor-settings-validation";
import type { Composition } from "./composition-types";
import type { CompositionPersistence } from "./composition-session";
import type { RecoveryClipDraft } from "./composition-batch";

export interface EditorTarget { projectId: string; clipId: string | null }
export interface CompositionSnapshot {
  document: Composition;
  manuallyEdited: boolean;
  editedAtMs: number;
  origin?: "manual";
  title?: string;
  createdAtMs?: number;
  review?: "pending" | "approved" | "rejected";
  deleted?: boolean;
}
export interface EditorProjectState {
  version: 1;
  project: CompositionSnapshot | null;
  clips: Record<string, CompositionSnapshot>;
}
export interface EditorRecovery {
  baseRevision: number;
  document: Composition;
  updatedAtMs: number;
  related?: RecoveryClipDraft[];
}
function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function snapshot(value: unknown): CompositionSnapshot {
  if (!isRecord(value) || typeof value.manuallyEdited !== "boolean" || !validRevision(value.editedAtMs)) throw new Error("Não foi possível ler a versão salva da montagem");
  if ((value.origin !== undefined && value.origin !== "manual") || (value.origin === "manual" && (typeof value.title !== "string" || !value.title.trim() || Array.from(value.title).length > 120 || !validRevision(value.createdAtMs) || value.createdAtMs === 0))
    || (value.review !== undefined && (typeof value.review !== "string" || !["pending", "approved", "rejected"].includes(value.review))) || (value.deleted !== undefined && typeof value.deleted !== "boolean")) throw new Error("Metadados do clipe salvo inválidos");
  return { document: parseComposition(value.document), manuallyEdited: value.manuallyEdited, editedAtMs: value.editedAtMs,
    ...(value.origin === "manual" ? { origin: "manual", title: value.title as string, createdAtMs: value.createdAtMs as number } : {}),
    ...(value.review !== undefined ? { review: value.review as CompositionSnapshot["review"] } : {}),
    ...(value.deleted !== undefined ? { deleted: value.deleted as boolean } : {}) };
}
export function parseEditorState(value: unknown): EditorProjectState {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.clips)) throw new Error("Não foi possível ler as montagens deste projeto");
  const clips: Record<string, CompositionSnapshot> = {};
  for (const [id, entry] of Object.entries(value.clips)) {
    if (!/^[a-f\d]{64}$/i.test(id)) throw new Error("Identificador de clipe inválido na edição salva");
    clips[id] = snapshot(entry);
  }
  return { version: 1, project: value.project === null ? null : snapshot(value.project), clips };
}
export async function loadEditorState(projectId: string): Promise<EditorProjectState> {
  return parseEditorState(await ipc.loadEditorProject(projectId));
}
export function notifyEditorSaved() {
  if (typeof window !== "undefined") window.dispatchEvent(new window.Event("cnp:editor-saved"));
}
export async function createManualClip(projectId: string, title: string, document: Composition) {
  const value = await ipc.createEditorClip(projectId, title, document);
  if (!isRecord(value) || typeof value.id !== "string" || !/^[a-f\d]{64}$/i.test(value.id)) throw new Error("Não foi possível confirmar o clipe criado");
  const saved = snapshot(value.snapshot);
  if (saved.origin !== "manual") throw new Error("Origem do clipe criado inválida");
  notifyEditorSaved();
  return { id: value.id, snapshot: saved };
}
export async function updateEditorClip(projectId: string, clipId: string, changes: { review?: CompositionSnapshot["review"]; deleted?: boolean }) {
  const saved = parseEditorState(await ipc.updateEditorClipMetadata(projectId, clipId, changes));
  return saved;
}
export function compositionPersistence(target: EditorTarget): CompositionPersistence {
  return {
    save: async (document, expectedRevision) => {
      const saved = snapshot(await ipc.saveEditorDocument(target.projectId, target.clipId, document, expectedRevision));
      if (target.clipId && !saved.manuallyEdited && saved.origin !== "manual") throw new Error("Não foi possível confirmar a edição manual deste clipe");
      return saved.document;
    },
    saveBatch: async (document, expectedRevision, related, activeChanged) => {
      const payload = related.map(({ clipId, expectedRevision, document }) => ({ clipId, expectedRevision, document }));
      const value = await ipc.saveEditorBatch(target.projectId, target.clipId, document, expectedRevision, payload, activeChanged);
      if (!isRecord(value) || !isRecord(value.related) || (value.snapshot !== null && !isRecord(value.snapshot))) throw new Error("Confirmação de lote inválida");
      const documents: Record<string, Composition> = {};
      for (const [id, saved] of Object.entries(value.related)) {
        if (!/^[a-f\d]{64}$/i.test(id)) throw new Error("Identificador inválido na confirmação do lote");
        documents[id] = snapshot(saved).document;
      }
      return { document: value.snapshot === null ? null : snapshot(value.snapshot).document, related: documents };
    },
  };
}
export async function loadRecovery(target: EditorTarget): Promise<EditorRecovery | null> {
  const value = await ipc.getEditorRecovery(target.projectId, target.clipId);
  if (value === null) return null;
  if (!isRecord(value) || !validRevision(value.baseRevision) || !validRevision(value.updatedAtMs)) throw new Error("Não foi possível ler a recuperação da montagem");
  const related: RecoveryClipDraft[] = [];
  if (value.related !== undefined) {
    if (!Array.isArray(value.related)) throw new Error("Recuperação do lote inválida");
    const ids = new Set<string>();
    for (const draft of value.related) {
      if (!isRecord(draft) || typeof draft.clipId !== "string" || !/^[a-f\d]{64}$/i.test(draft.clipId) || ids.has(draft.clipId) || draft.clipId === target.clipId || !validRevision(draft.expectedRevision)) throw new Error("Alvo inválido na recuperação do lote");
      ids.add(draft.clipId);
      related.push({ clipId: draft.clipId, expectedRevision: draft.expectedRevision, document: parseComposition(draft.document), ...(draft.baseDocument !== undefined ? { baseDocument: parseComposition(draft.baseDocument) } : {}) });
    }
  }
  return { baseRevision: value.baseRevision, updatedAtMs: value.updatedAtMs, document: parseComposition(value.document), ...(related.length ? { related } : {}) };
}
