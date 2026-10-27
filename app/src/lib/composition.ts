import type { Composition, CompositionItem, CompositionTrack } from "./composition-types";
import { isCompositionColor, isCompositionMarkers } from "./composition-markers";
import { isCompositionName } from "./composition-text";

export function compositionDuration(document: Composition): number {
  return Math.max(0, ...document.items.map(item => item.startFrame + item.durationFrames));
}

export function itemEnd(item: CompositionItem): number {
  return item.startFrame + item.durationFrames;
}

export function trackAccepts(track: CompositionTrack, item: CompositionItem): boolean {
  return track.kind === "visual" ? item.kind === "image" || item.kind === "video" : track.kind === item.kind;
}

export function validateComposition(document: Composition): string[] {
  const errors: string[] = [];
  const integer = (value: number, minimum: number) => Number.isSafeInteger(value) && value >= minimum;
  if (document.version !== 1 || !integer(document.revision, 0)) errors.push("Versão ou revisão inválida");
  if (!integer(document.fps.numerator, 1) || !integer(document.fps.denominator, 1)
    || document.fps.numerator / document.fps.denominator > 60) errors.push("Taxa de frames inválida");
  const assets = new Map(document.assets.map(asset => [asset.id, asset]));
  const tracks = new Map(document.tracks.map(track => [track.id, track]));
  if (assets.size !== document.assets.length || tracks.size !== document.tracks.length) errors.push("Identidade duplicada");
  if (document.tracks.filter(track => track.primary && track.kind === "visual").length !== 1) errors.push("Faixa principal inválida");
  if (new Set(document.items.map(item => item.id)).size !== document.items.length) errors.push("Identidade de item duplicada");
  if (document.markers !== undefined && !isCompositionMarkers(document.markers)) errors.push("Marcadores inválidos");
  for (const asset of document.assets) {
    if (!asset.id || !asset.mediaId || !asset.name || !integer(asset.durationUs, 0)) errors.push("Mídia inválida");
  }
  for (const item of document.items) {
    const asset = assets.get(item.assetId);
    const track = tracks.get(item.trackId);
    if (!item.id || !item.groupId || !asset || !track || !trackAccepts(track, item)) errors.push("Item sem mídia ou faixa compatível");
    if (!integer(item.startFrame, 0) || !integer(item.durationFrames, 1)) errors.push("Tempo de montagem inválido");
    if (!integer(item.sourceStartUs, 0) || !integer(item.sourceEndUs, item.sourceStartUs)) errors.push("Tempo de fonte inválido");
    if (asset && asset.kind !== "image" && (item.sourceEndUs <= item.sourceStartUs || item.sourceEndUs > asset.durationUs)) errors.push("Intervalo fora da fonte");
    if (asset && ((item.kind === "video" || item.kind === "image") ? item.kind !== asset.kind : asset.kind === "image")) errors.push("Tipo de mídia incompatível");
  }
  for (const track of document.tracks) {
    if (!isCompositionName(track.name)) errors.push("Nome de faixa inválido");
    if (track.color !== undefined && !isCompositionColor(track.color)) errors.push("Cor de faixa inválida");
    const items = document.items.filter(item => item.trackId === track.id).sort((a, b) => a.startFrame - b.startFrame);
    if (items.some((item, index) => index > 0 && item.startFrame < itemEnd(items[index - 1]))) errors.push("Sobreposição na mesma faixa");
  }
  return errors;
}

export function requireComposition(document: Composition): Composition {
  const errors = validateComposition(document);
  if (errors.length) throw new Error(errors.join(". "));
  return document;
}
