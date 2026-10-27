import { requireComposition } from "./composition";
import { assertWritable, removeEmptiedTracks } from "./composition-operations";
import { compositionNameLimit, isCompositionName } from "./composition-text";
import type { Composition, CompositionAsset } from "./composition-types";

function requireAsset(document: Composition, assetId: string): CompositionAsset {
  requireComposition(document);
  const asset = document.assets.find(value => value.id === assetId);
  if (!assetId || !asset) throw new Error("Mídia não encontrada na montagem.");
  return asset;
}

export function compositionAssetUsage(document: Composition, assetId: string): number {
  requireAsset(document, assetId);
  return new Set(document.items.filter(item => item.assetId === assetId).map(item => item.groupId)).size;
}

export function renameCompositionAsset(document: Composition, assetId: string, name: string): Composition {
  const asset = requireAsset(document, assetId);
  if (!isCompositionName(name) || /\p{Cc}/u.test(name)) throw new Error(`Use um nome de até ${compositionNameLimit} caracteres, sem caracteres de controle.`);
  const trimmed = name.trim();
  if (asset.name === trimmed) return document;
  return requireComposition({ ...document, assets: document.assets.map(value => value.id === assetId ? { ...value, name: trimmed } : value) });
}

export function removeCompositionAsset(document: Composition, assetId: string): Composition {
  requireAsset(document, assetId);
  assertWritable(document, document.items.filter(item => item.assetId === assetId));
  const next = { ...document, assets: document.assets.filter(asset => asset.id !== assetId), items: document.items.filter(item => item.assetId !== assetId) };
  return requireComposition(removeEmptiedTracks(document, next));
}
