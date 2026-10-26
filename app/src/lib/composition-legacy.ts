import { effectiveSegments } from "./edit-plan";
import { fpsFromRate, secondsToFrame } from "./composition-time";
import type { Composition, CompositionItem } from "./composition-types";
import type { WorkspaceData } from "./workspace-types";

export function compositionFromLegacy(workspace: WorkspaceData, metadata?: { fps?: number; hasAudio?: boolean }, sharedTranscript?: Composition["assets"][number]["transcript"]): Composition {
  const fps = fpsFromRate(metadata?.fps);
  const settings = structuredClone(workspace.settings);
  const result: Composition = {
    version: 1, revision: 0, fps, settings,
    assets: [], items: [],
    tracks: [
      { id: "V1", name: "Principal", kind: "visual", primary: true, locked: false, hidden: false, muted: false },
      { id: "A1", name: "Áudio da fonte", kind: "audio", primary: false, locked: false, hidden: false, muted: false },
      { id: "C1", name: "Legendas", kind: "caption", primary: false, locked: false, hidden: false, muted: false },
    ],
  };
  const media = workspace.media;
  if (!media) return result;
  if (!media.mediaId || !media.duration) throw new Error("Reconecte o vídeo original para carregar esta montagem");
  const assetId = media.mediaId;
  result.assets.push({ id: assetId, mediaId: assetId, name: media.name, kind: "video", durationUs: Math.round(media.duration * 1_000_000), width: media.width ?? 0, height: media.height ?? 0, hasAudio:metadata?.hasAudio!==false, transcript: sharedTranscript ?? structuredClone(workspace.transcript) });
  let startFrame = 0;
  for (const [index, segment] of effectiveSegments(settings, media.duration).entries()) {
    const durationFrames = Math.max(1, secondsToFrame(segment.sourceEnd - segment.sourceStart, fps));
    const base: CompositionItem = {
      id: `source-${index}-video`, assetId, trackId: "V1", kind: "video", groupId: `source-${index}`,
      startFrame, durationFrames, sourceStartUs: Math.round(segment.sourceStart * 1_000_000), sourceEndUs: Math.round(segment.sourceEnd * 1_000_000),
      followsMain: true, settings: structuredClone(settings), captionEdits: {},
    };
    result.items.push(base);
    if (metadata?.hasAudio !== false) result.items.push({ ...structuredClone(base), id: `source-${index}-audio`, trackId: "A1", kind: "audio" });
    if (workspace.transcript.length) result.items.push({ ...structuredClone(base), id: `source-${index}-caption`, trackId: "C1", kind: "caption" });
    startFrame += durationFrames;
  }
  return result;
}
