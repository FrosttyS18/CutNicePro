import { itemEnd } from "./composition";
import { frameToSeconds } from "./composition-time";
import type { Composition, CompositionItem, FrameRate } from "./composition-types";
import type { TranscriptSegment } from "./workspace-types";

function matchesSourceAudio(video: CompositionItem, audio: CompositionItem): boolean {
  return video.kind === "video" && audio.kind === "audio" && audio.followsMain
    && video.assetId === audio.assetId && video.groupId === audio.groupId
    && video.startFrame === audio.startFrame && video.durationFrames === audio.durationFrames
    && video.sourceStartUs === audio.sourceStartUs && video.sourceEndUs === audio.sourceEndUs;
}

export function linkedSourceAudio(document: Composition, video: CompositionItem): CompositionItem | undefined {
  if (video.kind !== "video") return undefined;
  const visualTrack = document.tracks.find(track => track.id === video.trackId);
  if (!visualTrack || visualTrack.hidden || visualTrack.muted) return undefined;
  const matches = document.items.filter(item => matchesSourceAudio(video, item));
  if (matches.length !== 1) return undefined;
  const audio = matches[0];
  const track = document.tracks.find(value => value.id === audio.trackId);
  if (!track || track.hidden || track.muted || track.locked) return undefined;
  return document.items.filter(item => matchesSourceAudio(item, audio)).length === 1 ? audio : undefined;
}

export function sourceVideoForAudio(document: Composition, audio: CompositionItem): CompositionItem | undefined {
  if (audio.kind !== "audio" || !audio.followsMain) return undefined;
  return document.items.find(item => matchesSourceAudio(item, audio) && linkedSourceAudio(document, item)?.id === audio.id);
}

export function activeItems(document: Composition, frame: number): CompositionItem[] {
  return document.items.filter(item => {
    const track = document.tracks.find(value => value.id === item.trackId);
    return track && !track.hidden && !(item.kind === "audio" && (track.muted || item.settings.muted))
      && item.startFrame <= frame && itemEnd(item) > frame;
  }).sort((a,b) => document.tracks.findIndex(track=>track.id===a.trackId) - document.tracks.findIndex(track=>track.id===b.trackId));
}

export function sourceTimeAt(item: CompositionItem, frame: number, fps: FrameRate): number {
  if (item.kind === "image") return 0;
  return Math.min(item.sourceEndUs / 1_000_000, item.sourceStartUs / 1_000_000 + frameToSeconds(Math.max(0, frame - item.startFrame), fps));
}

export interface MontageTranscriptEntry {
  itemId: string;
  sourceSegmentId: string;
  segment: TranscriptSegment;
}

export function montageTranscript(document: Composition): MontageTranscriptEntry[] {
  const entries: MontageTranscriptEntry[] = [];
  for (const item of document.items.filter(value => value.kind === "caption")) {
    const asset = document.assets.find(value => value.id === item.assetId);
    if (!asset) continue;
    const start = item.sourceStartUs / 1_000_000;
    const end = item.sourceEndUs / 1_000_000;
    const offset = frameToSeconds(item.startFrame, document.fps) - start;
    for (const source of asset.transcript) {
      if (source.end <= start || source.start >= end) continue;
      const override = item.captionEdits[source.id];
      const edited=typeof override==="string" ? {text:override,words:undefined} : override;
      const sourceWords = (edited===undefined ? source.words : edited.words)?.filter(word => word.end > start && word.start < end);
      const words = sourceWords?.map(word => ({ ...word, start: Math.max(start, word.start) + offset, end: Math.min(end, word.end) + offset }));
      entries.push({ itemId: item.id, sourceSegmentId: source.id, segment: {
        ...source, id: `${item.id}/${source.id}`, text: edited?.text ?? (sourceWords?.map(word => word.text).join(" ") || source.text),
        start: Math.max(source.start, start) + offset, end: Math.min(source.end, end) + offset, words,
      } });
    }
  }
  return entries.sort((a,b)=>a.segment.start-b.segment.start);
}
