const listeners = new Set<(mediaId: string) => void>();

export function subscribeMediaRelinked(listener: (mediaId: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyMediaRelinked(mediaId: string): void {
  for (const listener of listeners) listener(mediaId);
}
