import { editorAspectRatios } from "../components/upload/tools";
import { isCaptionStyle } from "./captions";
import { isSplitScreen } from "./split-screen";
import type { EditorSettings } from "./workspace-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function numberIn(value: unknown, min: number, max = Infinity): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
export function isEditorSettings(value: unknown): value is EditorSettings {
  if (!isRecord(value)) return false;
  const effects = value.effects;
  const focal = value.focalPoint;
  return editorAspectRatios.some(ratio => ratio === value.ratio) && ["contain", "cover"].some(fit => fit === value.fit)
    && (value.splitScreen == null || (value.ratio === "9:16" && isSplitScreen(value.splitScreen)))
    && numberIn(value.captionModel, 0, 9) && Number.isInteger(value.captionModel)
    && (value.captionStyle === undefined || isCaptionStyle(value.captionStyle))
    && (focal === undefined || (isRecord(focal) && numberIn(focal.x, 0, 100) && numberIn(focal.y, 0, 100)))
    && (value.zoom === undefined || numberIn(value.zoom, 1, 3))
    && (effects === undefined || (isRecord(effects) && numberIn(effects.brightness, 40, 180)
      && numberIn(effects.contrast, 40, 180) && numberIn(effects.saturation, 0, 220)
      && numberIn(effects.blur, 0, 8) && numberIn(effects.hue, -180, 180)))
    && typeof value.text === "string" && value.text.length <= 240
    && numberIn(value.volume, 0, 2) && typeof value.muted === "boolean"
    && typeof value.background === "string" && /^#[0-9a-f]{6}$/i.test(value.background)
    && numberIn(value.trimStart, 0) && (value.trimEnd === null || numberIn(value.trimEnd, value.trimStart));
}
