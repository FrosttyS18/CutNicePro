import { activeItems } from "./composition-playback";
import { captionSourceVideo } from "./composition-item-links";
import type { MontageTranscriptEntry } from "./composition-playback";
import type { Composition, CompositionItem } from "./composition-types";

export function compositionContextItem(document: Composition, frame: number, selected: string[]): CompositionItem | undefined {
  const items = selected.length ? document.items.filter(item => selected.includes(item.id)) : activeItems(document, frame);
  const visual = items.filter(item => item.kind === "video" || item.kind === "image");
  return visual.sort((a, b) => document.tracks.findIndex(track => track.id === b.trackId) - document.tracks.findIndex(track => track.id === a.trackId))[0] ?? items[0];
}

export function transcriptForItem(document: Composition, entries: MontageTranscriptEntry[], item?: CompositionItem): MontageTranscriptEntry[] {
  if (!item) return entries;
  if (item.kind === "caption") return entries.filter(entry => entry.itemId === item.id);
  const ids = new Set(document.items.filter(caption => captionSourceVideo(document, caption)?.id === item.id).map(caption => caption.id));
  return entries.filter(entry => ids.has(entry.itemId));
}
