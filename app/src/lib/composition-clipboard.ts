import type { Composition } from "./composition-types";

let snapshot: Composition | null = null;
const listeners = new Set<() => void>();

export function subscribeCompositionClipboard(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function hasCompositionClipboard(): boolean { return snapshot !== null; }

export function writeCompositionClipboard(fragment: Composition): boolean {
  if (!fragment.items.length) return false;
  const usedAssets = new Set(fragment.items.map(item => item.assetId));
  snapshot = structuredClone({ ...fragment, assets: fragment.assets.filter(asset => usedAssets.has(asset.id)) });
  listeners.forEach(listener => listener());
  return true;
}

export function readCompositionClipboard(): Composition | null {
  return snapshot ? structuredClone(snapshot) : null;
}
