import { itemEnd } from "./composition";
import { linkedSelection } from "./composition-operations";
import type { Composition, CompositionItem } from "./composition-types";

export interface TrimOptions { magnetic?: boolean }

export function canRecoverSourceAtOrigin(document: Composition, item: CompositionItem): boolean {
  return item.kind === "video" && item.startFrame === 0 && item.sourceStartUs > 0
    && document.tracks.some(track => track.id === item.trackId && track.primary);
}

export function trimDeltaBounds(document: Composition, item: CompositionItem, edge: "start" | "end", options: TrimOptions = {}): [number, number] {
  const recovery = edge === "start" && canRecoverSourceAtOrigin(document, item);
  const ripple = (edge === "end" || recovery) && options.magnetic !== false && document.tracks.find(track => track.id === item.trackId)?.primary;
  const framesWithin = (us: number) => Math.max(0, Math.floor((us + 0.5) * document.fps.numerator / (1_000_000 * document.fps.denominator)));
  const group = linkedSelection(document, [item.id]);
  const selected = new Set(group.map(value => value.id));
  let minimum = -1_000_000;
  let maximum = 1_000_000;
  for (const value of group) {
    const asset = document.assets.find(candidate => candidate.id === value.assetId);
    if (!asset) throw new Error("Mídia do item não encontrada");
    if (edge === "start") {
      minimum = Math.max(minimum, value.kind === "image" ? minimum : -framesWithin(value.sourceStartUs), recovery ? minimum : -value.startFrame);
      maximum = Math.min(maximum, value.durationFrames - 1);
    } else {
      minimum = Math.max(minimum, 1 - value.durationFrames);
      maximum = Math.min(maximum, value.kind === "image" ? maximum : framesWithin(asset.durationUs - value.sourceEndUs));
    }
    if (!ripple) for (const other of document.items) {
      if (selected.has(other.id) || other.trackId !== value.trackId) continue;
      if (edge === "start" && !recovery && itemEnd(other) <= value.startFrame) minimum = Math.max(minimum, itemEnd(other) - value.startFrame);
      if (recovery && other.startFrame >= itemEnd(value)) minimum = Math.max(minimum, itemEnd(value) - other.startFrame);
      if (edge === "end" && other.startFrame >= itemEnd(value)) maximum = Math.min(maximum, other.startFrame - itemEnd(value));
    }
  }
  return [minimum || 0, maximum || 0];
}

export function selectionForClick(document: Composition, selected: string[], item: CompositionItem, modifiers: { control?: boolean; shift?: boolean }, anchorId?: string): string[] {
  if (modifiers.control) {
    const linked = linkedSelection(document, selected);
    if (linked.some(value => value.id === item.id)) {
      const group = new Set(linkedSelection(document, [item.id]).map(value => value.id));
      return selected.filter(id => !group.has(id));
    }
    return [...selected, item.id];
  }
  if (modifiers.shift) {
    const anchor = document.items.find(value => value.id === anchorId)
      ?? document.items.find(value => selected.includes(value.id) && value.trackId === item.trackId);
    if (!anchor) return [...new Set([...selected, item.id])];
    const start = Math.min(anchor.startFrame, item.startFrame);
    const end = Math.max(anchor.startFrame, item.startFrame);
    const between = document.items.filter(value => (value.trackId === item.trackId || value.trackId === anchor.trackId) && value.startFrame >= start && value.startFrame <= end);
    return [...new Set([...selected, ...between.map(value => value.id)])];
  }
  return selected.includes(item.id) ? selected : [item.id];
}

export function scrollTimelineAtPointer(element: HTMLElement | null, clientX: number): boolean {
  if (!element || element.clientWidth <= 192) return false;
  const rect = element.getBoundingClientRect();
  const left = rect.left + 144;
  const right = rect.right;
  const step = clientX < left + 36 ? -Math.min(24, Math.max(2, (left + 36 - clientX) / 2))
    : clientX > right - 36 ? Math.min(24, Math.max(2, (clientX - right + 36) / 2)) : 0;
  const previous = element.scrollLeft;
  element.scrollLeft = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, previous + step));
  return element.scrollLeft !== previous;
}
