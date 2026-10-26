import { itemEnd, requireComposition } from "./composition";
import { assertWritable, editId, linkedSelection, removeEmptiedTracks, sliceItem } from "./composition-operations";
import type { Composition } from "./composition-types";

export function splitSelection(document: Composition, ids: string[], frame: number): Composition {
  const selected = linkedSelection(document, ids).filter(item => item.startFrame < frame && itemEnd(item) > frame);
  if (!selected.length) return document;
  if (!Number.isSafeInteger(frame)) throw new Error("Posição inválida");
  assertWritable(document, selected);
  const selectedIds = new Set(selected.map(item => item.id));
  const groups = new Map(selected.map(item => [item.groupId, editId()]));
  const items = document.items.flatMap(item => selectedIds.has(item.id)
    ? [sliceItem(item, 0, frame - item.startFrame, document.fps, item.startFrame),
      sliceItem(item, frame - item.startFrame, item.durationFrames, document.fps, frame, editId(), groups.get(item.groupId)!)]
    : [item]);
  return requireComposition({ ...document, items });
}

export function removeRangeItems(document: Composition, start: number, end: number, ripple = true): Composition {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) throw new Error("Intervalo inválido");
  const affected = document.items.filter(item => item.followsMain && itemEnd(item) > start && (ripple || item.startFrame < end));
  assertWritable(document, affected);
  const groups = new Map(affected.map(item => [item.groupId, editId()]));
  const items = document.items.flatMap(item => {
    if (!item.followsMain || itemEnd(item) <= start) return [item];
    if (item.startFrame >= end) return ripple ? [{ ...item, startFrame: item.startFrame - (end - start) }] : [item];
    const left = Math.max(0, start - item.startFrame);
    const right = Math.max(0, itemEnd(item) - end);
    const result = [];
    if (left) result.push(sliceItem(item, 0, left, document.fps, item.startFrame));
    if (right) result.push(sliceItem(item, item.durationFrames - right, item.durationFrames, document.fps,
      ripple ? start : end, left ? editId() : item.id, left ? groups.get(item.groupId)! : item.groupId));
    return result;
  });
  return requireComposition({ ...document, items });
}

export function removeRange(document: Composition, start: number, end: number, ripple = true): Composition {
  return requireComposition(removeEmptiedTracks(document, removeRangeItems(document, start, end, ripple)));
}

export function removeSelection(document: Composition, ids: string[], ripple = true): Composition {
  const selected = linkedSelection(document, ids);
  assertWritable(document, selected);
  const primary = document.tracks.find(track => track.primary)!.id;
  const main = selected.filter(item => item.trackId === primary).sort((a, b) => b.startFrame - a.startFrame);
  let next = document;
  for (const item of main) next = removeRangeItems(next, item.startFrame, itemEnd(item), ripple);
  const selectedIds = new Set(selected.map(item => item.id));
  return requireComposition(removeEmptiedTracks(document, { ...next, items: next.items.filter(item => !selectedIds.has(item.id)) }));
}
