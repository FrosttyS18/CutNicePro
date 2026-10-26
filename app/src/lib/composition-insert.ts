import { compositionDuration, itemEnd, requireComposition } from "./composition";
import { assertWritable, editId, linkedSelection, openGap, sliceItem } from "./composition-operations";
import { frameToSeconds, secondsToFrame } from "./composition-time";
import { removeRangeItems } from "./composition-edit";
import type { Composition, CompositionTrack } from "./composition-types";

export function extractComposition(document: Composition, start: number, end: number): Composition {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > compositionDuration(document)) throw new Error("Intervalo inválido");
  const items = document.items.filter(item => item.startFrame < end && itemEnd(item) > start).map(item => {
    const from = Math.max(0, start - item.startFrame);
    const to = Math.min(item.durationFrames, end - item.startFrame);
    return sliceItem(item, from, to, document.fps, Math.max(0, item.startFrame - start));
  });
  return requireComposition({ ...document, revision: 0, items });
}

export function insertComposition(document: Composition, fragment: Composition, at: number, preserveIds = false): Composition {
  requireComposition(fragment);
  const primary = document.tracks.find(track => track.primary)!;
  const sourcePrimary = fragment.tracks.find(track => track.primary)!;
  const hasMain = fragment.items.some(item => item.trackId === sourcePrimary.id);
  if (hasMain && primary.locked) throw new Error("A faixa principal está bloqueada");
  const frames = secondsToFrame(frameToSeconds(compositionDuration(fragment), fragment.fps), document.fps);
  const next = hasMain ? openGap(document, at, frames) : document;
  const tracks = [...next.tracks];
  const items = [...next.items];
  const assets = [...next.assets];
  for (const asset of fragment.assets) {
    const existing = assets.find(value => value.id === asset.id);
    if (existing && existing.mediaId !== asset.mediaId) throw new Error("Referência de mídia incompatível");
    if (!existing) assets.push(asset);
  }
  const groups = new Map(fragment.items.map(item => [item.groupId, editId()]));
  const trackMap = new Map<string, CompositionTrack>();
  for (const item of fragment.items) {
    const originalTrack = fragment.tracks.find(track => track.id === item.trackId)!;
    const startFrame = at + secondsToFrame(frameToSeconds(item.startFrame, fragment.fps), document.fps);
    const durationFrames = Math.max(1, secondsToFrame(frameToSeconds(item.durationFrames, fragment.fps), document.fps));
    let track = originalTrack.primary ? primary : trackMap.get(originalTrack.id);
    if (!track) track = tracks.find(value => value.kind === originalTrack.kind && !value.primary && !value.locked
      && !items.some(other => other.trackId === value.id && other.startFrame < startFrame + durationFrames && itemEnd(other) > startFrame));
    if (track && items.some(other => other.trackId === track!.id && other.startFrame < startFrame + durationFrames && itemEnd(other) > startFrame)) track = undefined;
    if (!track) {
      if (originalTrack.primary) throw new Error("A faixa principal está ocupada");
      track = { ...originalTrack, id: editId(), locked: false };
      tracks.push(track);
    }
    trackMap.set(originalTrack.id, track);
    items.push({ ...structuredClone(item), id: preserveIds ? item.id : editId(), groupId: groups.get(item.groupId)!, trackId: track.id,
      startFrame, durationFrames, settings: { ...structuredClone(item.settings), ratio: document.settings.ratio } });
  }
  return requireComposition({ ...next, assets, tracks, items });
}

export function overlayComposition(document: Composition, fragment: Composition, at: number): Composition {
  if (!Number.isSafeInteger(at) || at < 0) throw new Error("Destino inválido");
  requireComposition(document); requireComposition(fragment);
  if (!fragment.items.length) return document;
  const assets = [...document.assets], tracks = [...document.tracks], items = [...document.items];
  for (const asset of fragment.assets) {
    const existing = assets.find(value => value.id === asset.id);
    if (existing && existing.mediaId !== asset.mediaId) throw new Error("Referência de mídia incompatível");
    if (!existing) assets.push(asset);
  }
  const groups = new Map<string, string>();
  const converted = fragment.items.map(item => {
    if (!groups.has(item.groupId)) groups.set(item.groupId, editId());
    return { ...structuredClone(item), id: editId(), groupId: groups.get(item.groupId)!,
      startFrame: at + secondsToFrame(frameToSeconds(item.startFrame, fragment.fps), document.fps),
      durationFrames: Math.max(1, secondsToFrame(frameToSeconds(item.durationFrames, fragment.fps), document.fps)),
      settings: { ...structuredClone(item.settings), ratio: document.settings.ratio } };
  });
  for (const originalTrack of fragment.tracks) {
    const incoming = converted.filter(item => item.trackId === originalTrack.id);
    if (!incoming.length) continue;
    let track = originalTrack.kind === "visual" ? undefined : tracks.find(value => value.kind === originalTrack.kind && !value.primary && !value.locked
      && value.hidden === originalTrack.hidden && value.muted === originalTrack.muted
      && !incoming.some(item => items.some(other => other.trackId === value.id && other.startFrame < itemEnd(item) && itemEnd(other) > item.startFrame)));
    if (!track) {
      track = { ...originalTrack, id: editId(), name: originalTrack.primary ? "Sobreposição" : originalTrack.name, primary: false, locked: false };
      tracks.push(track);
    }
    items.push(...incoming.map(item => ({ ...item, trackId: track.id })));
  }
  return requireComposition({ ...document, assets, tracks, items });
}

export function duplicateSelection(document: Composition, ids: string[], mode: "overlay" | "sequence" = "overlay"): Composition {
  const selected = linkedSelection(document, ids);
  if (!selected.length) return document;
  assertWritable(document, selected);
  const start = Math.min(...selected.map(item => item.startFrame));
  const end = Math.max(...selected.map(itemEnd));
  const fragment = { ...document, items: selected.map(item => ({ ...item, startFrame: item.startFrame - start })) };
  return mode === "sequence" ? insertComposition(document, fragment, end) : overlayComposition(document, fragment, start);
}

export function moveSelection(document: Composition, ids: string[], at: number): Composition {
  if (!Number.isSafeInteger(at) || at < 0) throw new Error("Destino inválido");
  const selected = linkedSelection(document, ids);
  if (!selected.length) return document;
  assertWritable(document, selected);
  const primary = document.tracks.find(track => track.primary)!.id;
  const main = selected.filter(item => item.trackId === primary).sort((a,b)=>a.startFrame-b.startFrame);
  if (!main.length) {
    const offset = at - Math.min(...selected.map(item => item.startFrame));
    const selectedIds = new Set(selected.map(item => item.id));
    return requireComposition({ ...document, items: document.items.map(item => selectedIds.has(item.id) ? { ...item, startFrame: item.startFrame + offset } : item) });
  }
  if (main.some(item => at >= item.startFrame && at < itemEnd(item))) return document;
  const origin=Math.min(...selected.map(item=>item.startFrame));
  const extras=selected.filter(item=>item.trackId!==primary && (!item.followsMain || !main.some(value=>item.startFrame>=value.startFrame&&itemEnd(item)<=itemEnd(value))));
  const extraIds=new Set(extras.map(item=>item.id));
  const moving = [];
  for (const item of main) {
    const fragment = extractComposition({ ...document, items: document.items.filter(value => value.followsMain&&!extraIds.has(value.id)) }, item.startFrame, itemEnd(item));
    const groups = new Map(fragment.items.map(value => [value.groupId, editId()]));
    for (const part of fragment.items) {
      const original = document.items.find(value => value.id === part.id)!;
      moving.push({ ...part, id: original.startFrame < item.startFrame || itemEnd(original) > itemEnd(item) ? editId() : part.id,
        groupId: groups.get(part.groupId)!, startFrame: part.startFrame + item.startFrame-origin });
    }
  }
  moving.push(...extras.map(item=>({...structuredClone(item),startFrame:item.startFrame-origin})));
  let remaining = {...document,items:document.items.filter(item=>!extraIds.has(item.id))};
  for (const item of [...main].reverse()) remaining = removeRangeItems(remaining, item.startFrame, itemEnd(item));
  const destination = at - main.filter(item => itemEnd(item) <= at).reduce((total,item)=>total+item.durationFrames,0);
  return insertComposition(remaining, { ...document, items: moving }, destination, true);
}
