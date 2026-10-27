import { itemEnd, requireComposition } from "./composition";
import { assertWritable, editId } from "./composition-operations";
import type { CaptionStyle } from "./captions";
import type { Composition, CompositionItem } from "./composition-types";
import type { TranscriptSegment } from "./workspace-types";

function captionSources(document: Composition, mediaId: string): CompositionItem[] {
  const assets = new Set(document.assets.filter(asset => asset.mediaId === mediaId && asset.kind !== "image").map(asset => asset.id));
  const groups = new Set<string>();
  return document.items.filter(item => item.kind === "video" || item.kind === "audio").sort((a, b) => Number(b.kind === "video") - Number(a.kind === "video"))
    .filter(item => {
      const group = `${item.assetId}/${item.groupId}`;
      if (!assets.has(item.assetId) || groups.has(group)) return false;
      groups.add(group); return true;
    });
}
function hasCaption(document: Composition, source: CompositionItem): boolean {
  return document.items.some(item => item.kind === "caption" && item.assetId === source.assetId && item.groupId === source.groupId);
}
function intersects(source: CompositionItem, transcript: TranscriptSegment[]): boolean {
  return transcript.some(segment => segment.end * 1e6 > source.sourceStartUs && segment.start * 1e6 < source.sourceEndUs);
}

export function hasCaptionTranscriptUpdate(document: Composition, mediaId: string, transcript: TranscriptSegment[]): boolean {
  if (!transcript.length) return false;
  const sources = captionSources(document, mediaId).filter(item => intersects(item, transcript));
  const key = JSON.stringify(transcript);
  return document.assets.some(asset => asset.mediaId === mediaId && asset.kind !== "image" && JSON.stringify(asset.transcript) !== key)
    || sources.some(item => !hasCaption(document, item));
}

export function applyCaptionTranscript(document: Composition, mediaId: string, transcript: TranscriptSegment[]): Composition {
  if (!hasCaptionTranscriptUpdate(document, mediaId, transcript)) return document;
  const sources = captionSources(document, mediaId);
  const assets = new Set(document.assets.filter(asset => asset.mediaId === mediaId && asset.kind !== "image").map(asset => asset.id));
  const existing = document.items.filter(item => item.kind === "caption" && assets.has(item.assetId));
  const incomingIds = new Set(transcript.map(segment => segment.id));
  if (existing.some(item => Object.keys(item.captionEdits).some(id => !incomingIds.has(id)))) {
    throw new Error("A nova transcrição mudou os trechos com correções locais. As legendas atuais foram preservadas; revise a transcrição no projeto antes de aplicar.");
  }
  assertWritable(document, existing);
  const tracks = [...document.tracks];
  const items = [...document.items];
  for (const source of sources) {
    if (hasCaption(document, source) || !intersects(source, transcript)) continue;
    const captionTracks = tracks.filter(track => track.kind === "caption");
    if (captionTracks.length && captionTracks.every(track => track.locked)) throw new Error("A faixa de legendas está bloqueada");
    let track = captionTracks.find(candidate => !candidate.locked && !items.some(item => item.trackId === candidate.id && item.startFrame < itemEnd(source) && itemEnd(item) > source.startFrame));
    if (!track) {
      track = { id: editId(), name: "Legendas", kind: "caption", primary: false, locked: false, hidden: false, muted: false };
      tracks.push(track);
    }
    items.push({ ...structuredClone(source), id: editId(), kind: "caption", trackId: track.id, placement: undefined, captionEdits: {} });
  }
  return requireComposition({ ...document, tracks, items,
    assets: document.assets.map(asset => assets.has(asset.id) ? { ...asset, transcript: structuredClone(transcript) } : asset) });
}

export function applyMontageCaptionStyle(document: Composition, model: number, style: CaptionStyle): Composition {
  assertWritable(document, document.items);
  return requireComposition({ ...document, settings: { ...document.settings, captionModel: model, captionStyle: structuredClone(style) },
    items: document.items.map(item => ({ ...item, settings: { ...item.settings, captionModel: model, captionStyle: structuredClone(style) } })) });
}
