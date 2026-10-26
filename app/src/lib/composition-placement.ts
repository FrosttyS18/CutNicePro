import type { CSSProperties } from "react";
import type { Composition, CompositionAsset, CompositionPlacement } from "./composition-types";
import type { EditorSettings } from "./workspace-types";

export const DEFAULT_PLACEMENT: Readonly<CompositionPlacement> = { x: 50, y: 50, scale: 1, opacity: 1 };

export function isCompositionPlacement(value: unknown): value is CompositionPlacement {
  if (!value || typeof value !== "object") return false;
  const placement = value as Record<string, unknown>;
  const between = (number: unknown, minimum: number, maximum: number) => typeof number === "number" && Number.isFinite(number)
    && number >= minimum && number <= maximum;
  return between(placement.x, 0, 100) && between(placement.y, 0, 100)
    && between(placement.scale, 0.1, 2) && between(placement.opacity, 0, 1);
}

export function placementStyle(placement: CompositionPlacement = DEFAULT_PLACEMENT): CSSProperties {
  return { left: `${placement.x}%`, top: `${placement.y}%`, transform: `translate(-50%, -50%) scale(${placement.scale})`, opacity: placement.opacity };
}

export function compositionOutputSize(document: Composition): { width: number; height: number } {
  switch (document.settings.ratio) {
    case "9:16": return { width: 1080, height: 1920 };
    case "16:9": return { width: 1920, height: 1080 };
    case "1:1": return { width: 1080, height: 1080 };
    case "4:5": return { width: 1080, height: 1350 };
    default: {
      const source = document.assets.find(asset => asset.kind === "video") ?? document.assets.find(asset => asset.kind === "image");
      if (!source || source.width < 2 || source.height < 2) return { width: 1920, height: 1080 };
      const scale = Math.min(1, 1920 / Math.max(source.width, source.height));
      return { width: Math.max(2, Math.floor(source.width * scale / 2) * 2), height: Math.max(2, Math.floor(source.height * scale / 2) * 2) };
    }
  }
}

export function visualContentStyle(asset: CompositionAsset, settings: EditorSettings, output: { width: number; height: number }): CSSProperties {
  if (asset.width < 2 || asset.height < 2) return { width: "100%", height: "100%", objectFit: settings.fit };
  const pick = settings.fit === "cover" ? Math.max : Math.min;
  const scale = pick(output.width / asset.width, output.height / asset.height) * (settings.zoom ?? 1);
  const even = (value: number) => Math.max(2, Math.trunc(Math.round(value) / 2) * 2);
  const width = even(asset.width * scale);
  const height = even(asset.height * scale);
  const cropWidth = Math.min(output.width, width);
  const cropHeight = Math.min(output.height, height);
  const x = (settings.focalPoint?.x ?? 50) / 100;
  const y = (settings.focalPoint?.y ?? 50) / 100;
  const left = Math.trunc((output.width - cropWidth) * x) - Math.trunc((width - cropWidth) * x);
  const top = Math.trunc((output.height - cropHeight) * y) - Math.trunc((height - cropHeight) * y);
  return { width: `${width / output.width * 100}%`, height: `${height / output.height * 100}%`, left: `${left / output.width * 100}%`, top: `${top / output.height * 100}%` };
}

export function compositionEffectFilter(effects: EditorSettings["effects"]): string | undefined {
  if (!effects) return undefined;
  const filters: string[] = [];
  if (effects.brightness !== 100) filters.push(`brightness(${effects.brightness / 100})`);
  if (effects.contrast !== 100) filters.push(`contrast(${effects.contrast / 100})`);
  if (effects.saturation !== 100) filters.push(`saturate(${effects.saturation / 100})`);
  if (effects.hue !== 0) filters.push(`hue-rotate(${effects.hue}deg)`);
  if (effects.blur > 0) filters.push(`blur(calc(100cqw * ${effects.blur / 1080}))`);
  return filters.length ? filters.join(" ") : undefined;
}
