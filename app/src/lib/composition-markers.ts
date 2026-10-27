import { isRecord } from "./editor-settings-validation";
import { compositionNameLimit, isCompositionName } from "./composition-text";
import type { Composition, CompositionMarker } from "./composition-types";

export const markerColors = ["#00C2BE", "#F27D79", "#E8A04A", "#8BCB88", "#A078E8"] as const;

export function isCompositionColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

export function isCompositionMarkers(value: unknown): value is CompositionMarker[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  const frames = new Set<number>();
  return value.every(marker => {
    if (!isRecord(marker) || typeof marker.id !== "string" || !marker.id.trim()
      || !isCompositionName(marker.name)
      || typeof marker.frame !== "number" || !Number.isSafeInteger(marker.frame) || marker.frame < 0
      || !isCompositionColor(marker.color) || ids.has(marker.id) || frames.has(marker.frame)) return false;
    ids.add(marker.id);
    frames.add(marker.frame);
    return true;
  });
}

function withMarkers(document: Composition, markers: CompositionMarker[]): Composition {
  if (!isCompositionMarkers(markers)) throw new Error(`Marcador inválido. Use nome de até ${compositionNameLimit} caracteres, cor hexadecimal e um quadro livre.`);
  return { ...document, markers };
}

export function addCompositionMarker(document: Composition, frame: number): Composition {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error("Quadro inválido para o marcador.");
  if (document.markers?.some(marker => marker.frame === frame)) return document;
  return withMarkers(document, [...document.markers ?? [], { id: crypto.randomUUID(), name: "Marcador", frame, color: markerColors[0] }]);
}

export function updateCompositionMarker(document: Composition, id: string, patch: Partial<Pick<CompositionMarker, "name" | "frame" | "color">>): Composition {
  const marker = document.markers?.find(value => value.id === id);
  if (!marker) return document;
  const next = { ...marker, ...patch, name: patch.name === undefined ? marker.name : patch.name.trim() };
  if (next.name === marker.name && next.frame === marker.frame && next.color === marker.color) return document;
  return withMarkers(document, document.markers!.map(value => value.id === id ? next : value));
}

export function removeCompositionMarker(document: Composition, id: string): Composition {
  if (!document.markers?.some(marker => marker.id === id)) return document;
  return withMarkers(document, document.markers.filter(marker => marker.id !== id));
}
