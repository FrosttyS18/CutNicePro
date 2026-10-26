import { itemEnd, requireComposition } from "./composition";
import { removeRange } from "./composition-edit";
import { canRecoverSourceAtOrigin, trimDeltaBounds, type TrimOptions } from "./composition-gesture";
import { assertWritable, linkedSelection, openGap, sliceItem } from "./composition-operations";
import { frameToUs } from "./composition-time";
import type { Composition } from "./composition-types";

function selectionAtPlayhead(document: Composition, ids: string[], frame: number) {
  const selected = new Set(ids);
  const targets = document.items.filter(item => selected.has(item.id) && (item.kind === "video" || item.kind === "image")
    && item.startFrame < frame && frame < itemEnd(item));
  return linkedSelection(document, targets.map(item => item.id));
}

export function canTrimSelectionAtPlayhead(document: Composition, ids: string[], frame: number): boolean {
  if (!Number.isSafeInteger(frame) || frame < 0) return false;
  const selected = selectionAtPlayhead(document, ids, frame);
  const locked = new Set(document.tracks.filter(track => track.locked).map(track => track.id));
  return selected.length > 0 && !selected.some(item => locked.has(item.trackId));
}

export function trimSelectionAtPlayhead(document: Composition, ids: string[], frame: number, side: "left" | "right"): Composition {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error("Cursor inválido");
  const selected = selectionAtPlayhead(document, ids, frame);
  if (!selected.length) return document;
  assertWritable(document, selected);
  const selectedIds = new Set(selected.map(item => item.id));
  const items = document.items.flatMap(item => {
    if (!selectedIds.has(item.id)) return [item];
    const from = side === "left" ? Math.max(0, frame - item.startFrame) : 0;
    const to = side === "right" ? Math.min(item.durationFrames, frame - item.startFrame) : item.durationFrames;
    if (from >= to) return [];
    if (from === 0 && to === item.durationFrames) return [item];
    return [sliceItem(item, from, to, document.fps, item.startFrame + from)];
  });
  return requireComposition({ ...document, items });
}

export function trimSelection(document: Composition, id: string, edge: "start" | "end", delta: number, options: TrimOptions = {}): Composition {
  if (!Number.isSafeInteger(delta)) throw new Error("Ajuste de tempo inválido");
  if (!delta) return document;
  const item = document.items.find(value => value.id === id);
  if (!item) throw new Error("Item não encontrado");
  const group = linkedSelection(document, [id]);
  assertWritable(document, group);
  const [minimum, maximum] = trimDeltaBounds(document, item, edge, options);
  if (delta < minimum || delta > maximum) throw new Error("O ajuste ultrapassa os limites da fonte ou da faixa");
  const durationChange = edge === "start" ? -delta : delta;
  const recovery = edge === "start" && delta < 0 && canRecoverSourceAtOrigin(document, item);
  const ripple = (edge === "end" || recovery) && options.magnetic !== false && document.tracks.find(track => track.id === item.trackId)?.primary;
  const changed = group.map(value => {
    const asset = document.assets.find(valueAsset => valueAsset.id === value.assetId)!;
    const durationFrames = value.durationFrames + durationChange;
    const sourceStartUs = value.kind === "image" ? 0 : value.sourceStartUs + (edge === "start" ? frameToUs(delta, document.fps) : 0);
    const sourceEndUs = value.kind === "image" ? 0 : value.sourceEndUs + (edge === "end" ? frameToUs(delta, document.fps) : 0);
    const startFrame = value.startFrame + (edge === "start" && !recovery ? delta : 0);
    if (durationFrames < 1 || startFrame < 0 || sourceStartUs < 0 || sourceEndUs > asset.durationUs) throw new Error("O ajuste ultrapassa os limites da fonte");
    return { ...value, durationFrames, sourceStartUs, sourceEndUs, startFrame };
  });
  if (ripple && durationChange < 0) {
    return removeRange(document, itemEnd(item) + delta, itemEnd(item));
  }
  const next = ripple ? openGap(document, recovery ? 0 : itemEnd(item), durationChange) : document;
  const replacements = new Map(changed.map(value => [value.id, value]));
  return requireComposition({ ...next, items: next.items.map(value => replacements.get(value.id) ?? value) });
}
