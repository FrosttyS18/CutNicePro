import type { Composition } from "./composition-types";

export type CompositionInsertionTarget = "cursor" | "start" | "end";
export interface CompositionSourceRequest { id: number; target: CompositionInsertionTarget }

export function resolveInsertionFrame(document: Composition, target: CompositionInsertionTarget, cursor: number): number {
  if (target === "start") return 0;
  if (target === "end") {
    const primary = document.tracks.find(track => track.primary);
    return document.items.reduce((end, item) => item.trackId === primary?.id ? Math.max(end, item.startFrame + item.durationFrames) : end, 0);
  }
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("A posição de inserção é inválida.");
  return cursor;
}

export function insertionTargetLabel(target: CompositionInsertionTarget): string {
  return target === "start" ? "Adicionar no início" : target === "end" ? "Adicionar no fim" : "Adicionar no cursor";
}
