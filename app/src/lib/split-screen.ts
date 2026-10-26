import type { EditorSettings, SplitPanel, SplitScreenSettings, SplitShot, SplitViewport } from "./workspace-types";

export function defaultSplitScreen(): SplitScreenSettings {
  return { version: 1, top: { x: 0, y: 50, zoom: 1 }, bottom: { x: 100, y: 50, zoom: 1 } };
}

function isPanel(value: unknown): value is SplitPanel {
  if (!value || typeof value !== "object") return false;
  const panel = value as Record<string, unknown>;
  return [panel.x, panel.y].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100)
    && typeof panel.zoom === "number" && Number.isFinite(panel.zoom) && panel.zoom >= 1 && panel.zoom <= 3;
}

export function isSplitScreen(value: unknown): value is SplitScreenSettings {
  if (!value || typeof value !== "object") return false;
  const layout = value as Record<string, unknown>;
  return layout.version === 1 && isPanel(layout.top) && isPanel(layout.bottom)
    && (layout.faceValidated === undefined || typeof layout.faceValidated === "boolean")
    && (layout.shots === undefined || (Array.isArray(layout.shots) && layout.shots.length > 0 && layout.shots.length <= 64
      && layout.shots.every((shot: unknown, index: number, shots: unknown[]) => isShot(shot)
        && (index === 0 || shot.sourceStart >= (shots[index - 1] as SplitShot).sourceEnd))));
}

function isShot(value: unknown): value is SplitShot {
  if (!value || typeof value !== "object") return false;
  const shot = value as Record<string, unknown>;
  return typeof shot.sourceStart === "number" && Number.isFinite(shot.sourceStart) && shot.sourceStart >= 0
    && typeof shot.sourceEnd === "number" && Number.isFinite(shot.sourceEnd) && shot.sourceEnd - shot.sourceStart >= 0.05
    && isPanel(shot.top) && isPanel(shot.bottom);
}

export function splitLayoutAt(layout: SplitScreenSettings, sourceTime: number): SplitScreenSettings | null {
  if (!Number.isFinite(sourceTime)) return null;
  if (!layout.shots) return layout;
  const shot = layout.shots.find(shot => sourceTime >= shot.sourceStart && sourceTime < shot.sourceEnd);
  return shot ? { ...layout, top: shot.top, bottom: shot.bottom } : null;
}

export function updateSplitPanel(layout: SplitScreenSettings, sourceTime: number, position: "top" | "bottom", patch: Partial<SplitPanel>): SplitScreenSettings {
  if (!layout.shots) return { ...layout, [position]: { ...layout[position], ...patch } };
  const index = layout.shots.findIndex(shot => sourceTime >= shot.sourceStart && sourceTime < shot.sourceEnd);
  if (index < 0) return layout;
  const shots = layout.shots.map((shot, current) => current === index ? { ...shot, [position]: { ...shot[position], ...patch } } : shot);
  return { ...layout, shots, ...(index === 0 ? { [position]: shots[0][position] } : {}) };
}

export function splitViewport(width: number | null | undefined, height: number | null | undefined, settings: EditorSettings): SplitViewport | undefined {
  if (!width || !height || width < 2 || height < 2 || settings.fit !== "cover" || settings.ratio !== "9:16") return undefined;
  const scale = Math.max(9 / width, 16 / height);
  const baseWidth = 9 / (width * scale), baseHeight = 16 / (height * scale);
  const zoom = settings.zoom ?? 1;
  const visibleWidth = baseWidth / zoom, visibleHeight = baseHeight / zoom;
  return { x: (1 - baseWidth) * (settings.focalPoint?.x ?? 50) / 100 + (baseWidth - visibleWidth) / 2,
    y: (1 - baseHeight) * (settings.focalPoint?.y ?? 50) / 100 + (baseHeight - visibleHeight) / 2,
    width: visibleWidth, height: visibleHeight };
}

export function splitPanelGeometry(sourceWidth: number, sourceHeight: number, panel: SplitPanel) {
  if (![sourceWidth, sourceHeight].every(n => Number.isFinite(n) && n >= 2) || !isPanel(panel)) {
    throw new Error("Dimensões ou painel inválidos para dividir a tela.");
  }
  const outputWidth = 1080;
  const outputHeight = 960;
  const scale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight) * panel.zoom;
  const evenUp = (value: number) => Math.ceil(value / 2) * 2;
  const scaledWidth = evenUp(sourceWidth * scale);
  const scaledHeight = evenUp(sourceHeight * scale);
  const cropX = Math.floor((scaledWidth - outputWidth) * panel.x / 100 / 2) * 2;
  const cropY = Math.floor((scaledHeight - outputHeight) * panel.y / 100 / 2) * 2;
  return { outputWidth, outputHeight, scaledWidth, scaledHeight, cropX, cropY,
    sourceX: cropX * sourceWidth / scaledWidth, sourceY: cropY * sourceHeight / scaledHeight,
    sourceWidth: outputWidth * sourceWidth / scaledWidth, sourceHeight: outputHeight * sourceHeight / scaledHeight };
}
