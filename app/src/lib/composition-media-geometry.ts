import { DEFAULT_PLACEMENT, MAX_COMPOSITION_SCALE, MIN_COMPOSITION_SCALE, visualContentStyle } from "./composition-placement";
import type { CompositionAsset, CompositionPlacement } from "./composition-types";
import type { EditorSettings } from "./workspace-types";

export type CompositionFramingAction = "move" | "nw" | "ne" | "sw" | "se";
export type CompositionResizeCorner = Exclude<CompositionFramingAction, "move">;
export interface MediaPoint { x: number; y: number }
export interface MediaSize { width: number; height: number }
export interface MediaRect extends MediaSize { left: number; top: number }
export interface CompositionMediaGeometry { output: MediaSize; content: MediaRect; visible: MediaRect; bounds: MediaRect }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function compositionMediaGeometry(
  asset: CompositionAsset, settings: EditorSettings, output: MediaSize, placement: CompositionPlacement = DEFAULT_PLACEMENT, split = false,
): CompositionMediaGeometry | null {
  if (![asset.width, asset.height, output.width, output.height].every(value => Number.isFinite(value) && value >= 2)) return null;
  const style = visualContentStyle(asset, settings, output);
  const percent = (value: unknown, dimension: number) => Math.round(Number.parseFloat(String(value ?? 0)) / 100 * dimension);
  const content = split ? { left: 0, top: 0, ...output } : {
    left: percent(style.left, output.width), top: percent(style.top, output.height),
    width: percent(style.width, output.width), height: percent(style.height, output.height),
  };
  const left = Math.max(0, content.left), top = Math.max(0, content.top);
  const visible = { left, top, width: Math.max(0, Math.min(output.width, content.left + content.width) - left),
    height: Math.max(0, Math.min(output.height, content.top + content.height) - top) };
  const bounds = {
    left: output.width * placement.x / 100 + (visible.left - output.width / 2) * placement.scale,
    top: output.height * placement.y / 100 + (visible.top - output.height / 2) * placement.scale,
    width: visible.width * placement.scale, height: visible.height * placement.scale,
  };
  return { output, content, visible, bounds };
}

export function focalPointAfterDrag(point: MediaPoint, output: MediaSize, rendered: MediaSize, delta: MediaPoint): MediaPoint {
  const axis = (value: number, distance: number, available: number) => Math.abs(available) < 1e-8 ? value : clamp(value + distance / available * 100, 0, 100);
  return { x: axis(point.x, delta.x, output.width - rendered.width), y: axis(point.y, delta.y, output.height - rendered.height) };
}

export function resizeCompositionPlacement(
  geometry: CompositionMediaGeometry, placement: CompositionPlacement, corner: CompositionResizeCorner, delta: MediaPoint,
): CompositionPlacement {
  if (delta.x === 0 && delta.y === 0) return placement;
  const { bounds, visible, output } = geometry;
  const east = corner.endsWith("e"), south = corner.startsWith("s");
  const vector = { x: (east ? 1 : -1) * bounds.width, y: (south ? 1 : -1) * bounds.height };
  const length = vector.x ** 2 + vector.y ** 2;
  if (!length) return placement;
  const anchor = { x: bounds.left + (east ? 0 : bounds.width), y: bounds.top + (south ? 0 : bounds.height) };
  const offset = { x: visible.left + (east ? 0 : visible.width) - output.width / 2,
    y: visible.top + (south ? 0 : visible.height) - output.height / 2 };
  let minimum = MIN_COMPOSITION_SCALE, maximum = MAX_COMPOSITION_SCALE;
  for (const [fixed, local, size] of [[anchor.x, offset.x, output.width], [anchor.y, offset.y, output.height]]) {
    if (Math.abs(local) < 1e-8) continue;
    const first = fixed / local, second = (fixed - size) / local;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
  }
  const scale = clamp(placement.scale * (1 + (delta.x * vector.x + delta.y * vector.y) / length), minimum, maximum);
  return { ...placement, scale, x: clamp((anchor.x - offset.x * scale) / output.width * 100, 0, 100),
    y: clamp((anchor.y - offset.y * scale) / output.height * 100, 0, 100) };
}
