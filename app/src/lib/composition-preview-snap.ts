import type { CompositionMediaGeometry, MediaSize } from "./composition-media-geometry";
import { isCompositionPlacement } from "./composition-placement";
import type { CompositionPlacement } from "./composition-types";

export interface CompositionSnapGuides { x?: number; y?: number }
export interface CompositionPreviewSnap { placement: CompositionPlacement; guides: CompositionSnapGuides }

function snapAxis(start: number, length: number, output: number, pixels: number, initial: number, candidate: number, threshold: number) {
  const offset = (candidate - initial) / 100 * output;
  const anchors = [[start + length / 2, output / 2], [start, 0], [start + length, output]];
  let result: { value: number; guide?: number } = { value: candidate };
  let nearest = Number.POSITIVE_INFINITY;
  for (const [anchor, target] of anchors) {
    const adjustment = target - anchor - offset;
    const distance = Math.abs(adjustment) * pixels / output;
    const value = initial + (target - anchor) / output * 100;
    if (value >= 0 && value <= 100 && distance <= threshold && distance < nearest) {
      result = { value, guide: target };
      nearest = distance;
    }
  }
  return result;
}

export function snapCompositionPlacement(
  geometry: CompositionMediaGeometry, initial: CompositionPlacement, candidate: CompositionPlacement, viewport: MediaSize, threshold = 6,
): CompositionPreviewSnap {
  const { output, bounds } = geometry;
  const sizes = [output.width, output.height, bounds.width, bounds.height, viewport.width, viewport.height];
  if (!isCompositionPlacement(initial) || !isCompositionPlacement(candidate) || initial.scale !== candidate.scale
    || !sizes.every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)
    || !Number.isFinite(threshold) || threshold < 0) return { placement: candidate, guides: {} };
  const horizontal = snapAxis(bounds.left, bounds.width, output.width, viewport.width, initial.x, candidate.x, threshold);
  const vertical = snapAxis(bounds.top, bounds.height, output.height, viewport.height, initial.y, candidate.y, threshold);
  const guides: CompositionSnapGuides = {};
  if (horizontal.guide !== undefined) guides.x = horizontal.guide;
  if (vertical.guide !== undefined) guides.y = vertical.guide;
  return { placement: { ...candidate, x: horizontal.value, y: vertical.value }, guides };
}
