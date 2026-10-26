import { itemEnd, requireComposition, trackAccepts } from "./composition";
import { assertWritable, editId, linkedSelection } from "./composition-operations";
import type { Composition, CompositionItem, CompositionTrack } from "./composition-types";

export interface ArrangeOptions {
  magnetic: boolean;
  newTrackId?: string;
  companionTrackIds?: Record<string, string>;
}

function reorderPrimary(document: Composition, selected: CompositionItem[], targetFrame: number, primary: string): Composition {
  const main = selected.filter(item => item.trackId === primary).sort((a, b) => a.startFrame - b.startFrame);
  if (main.some(item => targetFrame >= item.startFrame && targetFrame < itemEnd(item))) return document;
  const moving = new Set(main.map(item => item.id));
  const remaining = document.items.filter(item => item.trackId === primary && !moving.has(item.id)).sort((a, b) => a.startFrame - b.startFrame);
  const boundary = remaining.findIndex(item => targetFrame < item.startFrame + item.durationFrames / 2);
  const index = boundary < 0 ? remaining.length : boundary;
  const order = [...remaining.slice(0, index), ...main, ...remaining.slice(index)];
  const offsets = new Map<string, number>();
  const groups = new Map<string, number>();
  let cursor = 0;
  for (const item of order) {
    const offset = cursor - item.startFrame;
    if (groups.has(item.groupId) && groups.get(item.groupId) !== offset) throw new Error("O grupo não pode ser reordenado sem separar seus itens");
    offsets.set(item.id, offset);
    groups.set(item.groupId, offset);
    cursor += item.durationFrames;
  }
  const origin = Math.min(...selected.map(item => item.startFrame));
  const destination = Math.min(...main.map(item => item.startFrame + offsets.get(item.id)!));
  const selectedIds = new Set(selected.map(item => item.id));
  const items = document.items.map(item => {
    const offset = offsets.get(item.id) ?? (item.followsMain ? groups.get(item.groupId) : undefined)
      ?? (selectedIds.has(item.id) ? destination - origin : 0);
    return offset ? { ...item, startFrame: item.startFrame + offset } : item;
  });
  assertWritable(document, items.filter((item, index) => item !== document.items[index]));
  return items.every((item, index) => item === document.items[index]) ? document : requireComposition({ ...document, items });
}

function freeOffset(document: Composition, selected: CompositionItem[], requested: number, relocatable: ReadonlySet<string>): number {
  const selectedIds = new Set(selected.map(item => item.id));
  const minimum = -Math.min(...selected.map(item => item.startFrame));
  const blocked: [number, number][] = [];
  for (const item of selected) {
    if (relocatable.has(item.id)) continue;
    for (const other of document.items) {
      if (!selectedIds.has(other.id) && item.trackId === other.trackId) blocked.push([
        other.startFrame - itemEnd(item) + 1, itemEnd(other) - item.startFrame - 1,
      ]);
    }
  }
  blocked.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of blocked) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  const target = Math.max(minimum, requested);
  const collision = merged.find(([start, end]) => target >= start && target <= end);
  if (!collision) return target;
  const before = collision[0] - 1;
  const after = collision[1] + 1;
  return before >= minimum && target - before <= after - target ? before : after;
}

function placeCompanions(document: Composition, selected: CompositionItem[], tracks: CompositionTrack[], relocatable: ReadonlySet<string>, identities: Record<string, string> = {}) {
  const selectedIds = new Set(selected.map(item => item.id));
  const placed = [...document.items.filter(item => !selectedIds.has(item.id)), ...selected.filter(item => !relocatable.has(item.id))];
  const origins = new Set(selected.filter(item => relocatable.has(item.id)).map(item => item.trackId));
  const replacements = new Map<string, CompositionItem>();
  let nextTracks = tracks;
  for (const origin of origins) {
    const original = document.tracks.find(track => track.id === origin)!;
    const group = selected.filter(item => relocatable.has(item.id) && item.trackId === origin);
    const fits = (track: CompositionTrack) => group.every(item => !placed.some(other => other.trackId === track.id
      && other.startFrame < itemEnd(item) && itemEnd(other) > item.startFrame));
    let track = fits(original) ? original : nextTracks.find(candidate => candidate.kind === original.kind && !candidate.locked
      && !candidate.primary && candidate.hidden === original.hidden && candidate.muted === original.muted && fits(candidate));
    if (!track) {
      const id = identities[origin] ?? editId();
      if (!id || nextTracks.some(candidate => candidate.id === id)) throw new Error("Identidade de faixa vinculada inválida ou já existente");
      track = { ...original, id, primary: false, locked: false };
      nextTracks = [...nextTracks, track];
    }
    for (const item of group) {
      const next = item.trackId === track.id ? item : { ...item, trackId: track.id };
      replacements.set(item.id, next); placed.push(next);
    }
  }
  return { tracks: nextTracks, items: selected.map(item => replacements.get(item.id) ?? item) };
}

function destinationTrack(document: Composition, anchor: CompositionItem, targetTrackId: string | null, newTrackId?: string): CompositionTrack {
  if (targetTrackId !== null) {
    const track = document.tracks.find(value => value.id === targetTrackId);
    if (!track) throw new Error("Faixa de destino não encontrada");
    if (track.locked) throw new Error("A faixa de destino está bloqueada");
    if (!trackAccepts(track, anchor)) throw new Error("A faixa de destino não é compatível com o item");
    return track;
  }
  if (anchor.kind !== "video" && anchor.kind !== "image") throw new Error("A nova camada visual não é compatível com o item");
  const id = newTrackId ?? editId();
  if (!id || document.tracks.some(track => track.id === id)) throw new Error("Identidade de faixa inválida ou já existente");
  const number = document.tracks.filter(track => track.kind === "visual").length + 1;
  return { id, name: `Camada ${number}`, kind: "visual", primary: false, locked: false, hidden: false, muted: false };
}

export function moveSelectionToTrack(document: Composition, ids: string[], targetFrame: number, targetTrackId: string | null, options: ArrangeOptions): Composition {
  if (!Number.isSafeInteger(targetFrame) || targetFrame < 0) throw new Error("Destino inválido");
  const selected = linkedSelection(document, ids);
  if (!selected.length) return document;
  const anchor = document.items.find(item => item.id === ids[0]);
  if (!anchor) throw new Error("Item não encontrado");
  assertWritable(document, selected);
  const track = destinationTrack(document, anchor, targetTrackId, options.newTrackId);
  if (options.magnetic && track.primary && anchor.trackId === track.id) return reorderPrimary(document, selected, targetFrame, track.id);
  const mapped = selected.map(item => item.trackId === anchor.trackId ? { ...item, trackId: track.id } : item);
  if (mapped.some(item => item.trackId === track.id && !trackAccepts(track, item))) throw new Error("A faixa de destino não é compatível com a seleção");
  const origin = Math.min(...selected.map(item => item.startFrame));
  const visualMove = (anchor.kind === "video" || anchor.kind === "image") && (anchor.trackId !== track.id || !track.primary);
  const visualGroups = new Set(mapped.filter(item => item.kind === "video" || item.kind === "image").map(item => item.groupId));
  const relocatable = new Set(mapped.filter(item => visualMove && item.followsMain && (item.kind === "audio" || item.kind === "caption")
    && visualGroups.has(item.groupId)).map(item => item.id));
  const offset = freeOffset(document, mapped, targetFrame - origin, relocatable);
  let tracks = document.tracks;
  if (targetTrackId === null) {
    const above = document.tracks.reduce((last, value, index) => value.kind === "visual" ? index + 1 : last, 0);
    tracks = [...tracks.slice(0, above), track, ...tracks.slice(above)];
  }
  const companions = placeCompanions(document, mapped.map(item => ({ ...item, startFrame: item.startFrame + offset })), tracks, relocatable, options.companionTrackIds);
  tracks = companions.tracks;
  const replacements = new Map(companions.items.map(item => [item.id, item]));
  const changed = companions.items.some((item, index) => item.trackId !== selected[index].trackId) || offset !== 0;
  if (!changed && tracks === document.tracks) return document;
  return requireComposition({ ...document, tracks, items: document.items.map(item => replacements.get(item.id) ?? item) });
}
