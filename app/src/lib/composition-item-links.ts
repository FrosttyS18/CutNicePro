import type { Composition, CompositionItem } from "./composition-types";

function matchesCaption(video: CompositionItem, caption: CompositionItem): boolean {
  return video.kind === "video" && caption.kind === "caption" && caption.followsMain
    && video.assetId === caption.assetId && video.groupId === caption.groupId
    && video.startFrame === caption.startFrame && video.durationFrames === caption.durationFrames
    && video.sourceStartUs === caption.sourceStartUs && video.sourceEndUs === caption.sourceEndUs;
}

export function sourceVideoForCaption(document: Composition, caption: CompositionItem): CompositionItem | undefined {
  if (caption.kind !== "caption" || !caption.followsMain) return undefined;
  const captionTrack = document.tracks.find(track => track.id === caption.trackId);
  if (!captionTrack || captionTrack.kind !== "caption" || captionTrack.hidden || captionTrack.locked) return undefined;
  const matches = document.items.filter(item => matchesCaption(item, caption));
  if (matches.length !== 1) return undefined;
  const video = matches[0];
  const visualTrack = document.tracks.find(track => track.id === video.trackId);
  return visualTrack?.kind === "visual" && !visualTrack.hidden ? video : undefined;
}

export function linkedSourceCaptions(document: Composition, video: CompositionItem): CompositionItem[] {
  if (video.kind !== "video") return [];
  return document.items.filter(item => item.kind === "caption" && sourceVideoForCaption(document, item)?.id === video.id);
}
