import { isEditorSettings, isRecord } from "./editor-settings-validation";
import { requireComposition } from "./composition";
import type { Composition } from "./composition-types";
import { isCompositionPlacement } from "./composition-placement";
import { isCompositionColor, isCompositionMarkers } from "./composition-markers";
import { isCompositionName } from "./composition-text";

function integer(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function words(value:unknown):boolean {
  return value===undefined || Array.isArray(value) && value.every(word=>isRecord(word)&&typeof word.text==="string"
    && typeof word.start==="number"&&Number.isFinite(word.start)&&word.start>=0&&typeof word.end==="number"&&Number.isFinite(word.end)&&word.end>=word.start);
}
function transcript(value: unknown): boolean {
  return Array.isArray(value) && value.every(segment => isRecord(segment) && text(segment.id)
    && typeof segment.text === "string" && typeof segment.start === "number" && Number.isFinite(segment.start) && segment.start >= 0
    && typeof segment.end === "number" && Number.isFinite(segment.end) && segment.end >= segment.start
    && (segment.words === undefined || (Array.isArray(segment.words) && segment.words.every(word => isRecord(word)
      && typeof word.text === "string" && typeof word.start === "number" && Number.isFinite(word.start)
      && typeof word.end === "number" && Number.isFinite(word.end) && word.end >= word.start))));
}
function shape(value: unknown): value is Composition {
  if (!isRecord(value) || value.version !== 1 || !integer(value.revision) || !isRecord(value.fps)
    || !integer(value.fps.numerator, 1) || !integer(value.fps.denominator, 1) || !isEditorSettings(value.settings)) return false;
  if (!Array.isArray(value.assets) || !Array.isArray(value.tracks) || !Array.isArray(value.items)) return false;
  if (value.markers !== undefined && !isCompositionMarkers(value.markers)) return false;
  if (!value.assets.every(asset => isRecord(asset) && text(asset.id) && text(asset.mediaId) && text(asset.name)
    && ["video", "image", "audio"].includes(String(asset.kind)) && integer(asset.durationUs)
    && integer(asset.width) && integer(asset.height) && (asset.hasAudio===undefined||typeof asset.hasAudio==="boolean") && transcript(asset.transcript))) return false;
  if (!value.tracks.every(track => isRecord(track) && text(track.id) && isCompositionName(track.name)
    && ["visual", "audio", "caption"].includes(String(track.kind)) && typeof track.primary === "boolean"
    && (!track.primary || track.kind === "visual") && (track.color === undefined || isCompositionColor(track.color))
    && [track.locked, track.hidden, track.muted].every(flag => typeof flag === "boolean"))) return false;
  return value.items.every(item => isRecord(item) && text(item.id) && text(item.trackId) && text(item.assetId) && text(item.groupId)
    && ["video", "image", "audio", "caption"].includes(String(item.kind)) && integer(item.startFrame)
    && integer(item.durationFrames, 1) && integer(item.sourceStartUs) && integer(item.sourceEndUs)
    && typeof item.followsMain === "boolean" && isEditorSettings(item.settings)
    && (item.placement === undefined || isCompositionPlacement(item.placement))
    && isRecord(item.captionEdits) && Object.values(item.captionEdits).every(edit => typeof edit === "string" || isRecord(edit)&&typeof edit.text==="string"&&words(edit.words)));
}
export function parseComposition(value: unknown): Composition {
  if (!shape(value)) throw new Error("Não foi possível ler o contrato da montagem");
  return requireComposition(value);
}
