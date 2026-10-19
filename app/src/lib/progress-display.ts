export function nextProgress(displayed: number, measured: number): number {
  const target = Math.max(0, Math.min(100, Math.floor(Number.isFinite(measured) ? measured : 0)));
  return Math.min(target, Math.max(0, displayed) + 1);
}

export function constrainPanel(x: number, y: number, width: number, height: number, viewport: { width: number; height: number }) {
  return { x: Math.max(8, Math.min(x, viewport.width - width - 8)), y: Math.max(8, Math.min(y, viewport.height - height - 8)) };
}
