export function waveformEnvelope(peaks: number[], columns: number): number[] {
  const count = Math.min(peaks.length, Math.max(0, Math.floor(columns)));
  if (!count) return [];
  return Array.from({ length: count }, (_, column) => {
    const start = Math.floor(column * peaks.length / count);
    const end = Math.max(start + 1, Math.floor((column + 1) * peaks.length / count));
    let value = 0;
    for (let i = start; i < end; i++) value = Math.max(value, peaks[i]);
    return Math.min(1, Math.max(0, value));
  });
}
