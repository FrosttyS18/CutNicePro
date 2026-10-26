import { itemEnd, requireComposition } from "./composition";
import { frameToUs } from "./composition-time";
import type { Composition, CompositionItem, FrameRate } from "./composition-types";

export function editId(): string { return crypto.randomUUID(); }

export function linkedSelection(document: Composition, ids: string[]): CompositionItem[] {
  const selected = new Set(ids);
  const groups = new Set(document.items.filter(item => selected.has(item.id)).map(item => item.groupId));
  return document.items.filter(item => selected.has(item.id) || (item.followsMain && groups.has(item.groupId)));
}

export function assertWritable(document: Composition, items: CompositionItem[]): void {
  const locked = new Set(document.tracks.filter(track => track.locked).map(track => track.id));
  if (items.some(item => locked.has(item.trackId))) throw new Error("A operação altera uma faixa bloqueada");
}

export function sliceItem(item: CompositionItem, from: number, to: number, fps: FrameRate, startFrame: number, id = item.id, groupId = item.groupId): CompositionItem {
  return {
    ...item, id, groupId, startFrame, durationFrames: to - from,
    sourceStartUs: item.kind === "image" ? 0 : Math.min(item.sourceEndUs, item.sourceStartUs + frameToUs(from, fps)),
    sourceEndUs: item.kind === "image" ? 0 : Math.min(item.sourceEndUs, item.sourceStartUs + frameToUs(to, fps)),
    settings: structuredClone(item.settings), captionEdits: { ...item.captionEdits },
  };
}

export function openGap(document: Composition, at: number, frames: number): Composition {
  if (!Number.isSafeInteger(at) || at < 0 || !Number.isSafeInteger(frames) || frames < 0) throw new Error("Inserção inválida");
  if (!frames) return document;
  const affected = document.items.filter(item => item.followsMain && itemEnd(item) > at);
  assertWritable(document, affected);
  const rightGroups = new Map<string, string>();
  const rightGroup = (id: string) => {
    if (!rightGroups.has(id)) rightGroups.set(id, editId());
    return rightGroups.get(id)!;
  };
  const items = document.items.flatMap(item => {
    if (!item.followsMain || itemEnd(item) <= at) return [item];
    if (item.startFrame >= at) return [{ ...item, startFrame: item.startFrame + frames }];
    const split = at - item.startFrame;
    return [sliceItem(item, 0, split, document.fps, item.startFrame),
      sliceItem(item, split, item.durationFrames, document.fps, at + frames, editId(), rightGroup(item.groupId))];
  });
  return requireComposition({ ...document, items });
}
