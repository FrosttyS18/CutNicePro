import { describe, expect, it } from "vitest";
import { compositionMediaGeometry, focalPointAfterDrag, resizeCompositionPlacement } from "../lib/composition-media-geometry";
import { defaultEditorSettings } from "../lib/workspace";
import type { CompositionAsset, CompositionPlacement } from "../lib/composition-types";

const asset: CompositionAsset = { id: "source", mediaId: "source", name: "Original.mp4", kind: "video", width: 1920, height: 1080, durationUs: 2e6, transcript: [] };
const output = { width: 1080, height: 1920 };
const settings = { ...defaultEditorSettings(), fit: "contain" as const, zoom: 1, focalPoint: { x: 50, y: 50 } };
const placement: CompositionPlacement = { x: 50, y: 50, scale: 0.5, opacity: 0.6 };

describe("geometria de interação da mídia", () => {
  it("delimita somente a mídia contain e usa os pixels pares do render", () => {
    const geometry = compositionMediaGeometry(asset, settings, output, placement)!;
    expect(geometry.content).toEqual({ left: 0, top: 656, width: 1080, height: 608 });
    expect(geometry.bounds).toEqual({ left: 270, top: 808, width: 540, height: 304 });
  });

  it("delimita o cover no viewport da camada, sem selecionar conteúdo recortado", () => {
    const geometry = compositionMediaGeometry(asset, { ...settings, fit: "cover" }, output)!;
    expect(geometry.content.width).toBe(3412);
    expect(geometry.bounds).toEqual({ left: 0, top: 0, width: 1080, height: 1920 });
  });

  it("usa sinal da margem ou do excesso e não inventa movimento num eixo preenchido", () => {
    expect(focalPointAfterDrag({ x: 50, y: 50 }, output, { width: 1080, height: 608 }, { x: 50, y: -100 })).toEqual({ x: 50, y: 50 - 100 / 1312 * 100 });
    expect(focalPointAfterDrag({ x: 50, y: 50 }, output, { width: 3412, height: 1920 }, { x: 100, y: -50 })).toEqual({ x: 50 - 100 / 2332 * 100, y: 50 });
  });

  it.each(["nw", "ne", "sw", "se"] as const)("redimensiona pelo canto %s mantendo o canto oposto", corner => {
    const initial = compositionMediaGeometry(asset, settings, output, placement)!;
    const sx = corner.endsWith("e") ? 1 : -1, sy = corner.startsWith("s") ? 1 : -1;
    const next = resizeCompositionPlacement(initial, placement, corner, { x: sx * 270, y: sy * 152 });
    const resized = compositionMediaGeometry(asset, settings, output, next)!;
    expect(next.scale).toBeCloseTo(0.75, 8);
    expect(next.opacity).toBe(placement.opacity);
    const anchorX = (rect: typeof initial.bounds) => sx > 0 ? rect.left : rect.left + rect.width;
    const anchorY = (rect: typeof initial.bounds) => sy > 0 ? rect.top : rect.top + rect.height;
    expect(anchorX(resized.bounds)).toBeCloseTo(anchorX(initial.bounds), 8);
    expect(anchorY(resized.bounds)).toBeCloseTo(anchorY(initial.bounds), 8);
  });

  it("limita escala e centro sem atravessar o canto fixo", () => {
    const full = { ...placement, scale: 1 };
    const geometry = compositionMediaGeometry(asset, { ...settings, fit: "cover" }, output, full)!;
    expect(resizeCompositionPlacement(geometry, full, "se", { x: 1e6, y: 1e6 })).toEqual({ x: 100, y: 100, scale: 2, opacity: 0.6 });
    expect(resizeCompositionPlacement(geometry, full, "se", { x: -1e6, y: -1e6 })).toEqual({ x: 5, y: 5, scale: 0.1, opacity: 0.6 });
  });

  it("limita crescimento quando manter âncora exigiria centro fora do contrato", () => {
    const initial = { ...placement, x: 100 };
    const geometry = compositionMediaGeometry(asset, settings, output, initial)!;
    expect(resizeCompositionPlacement(geometry, initial, "se", { x: 500, y: 300 })).toEqual(initial);
  });

  it("amplia uma camada já posicionada acima de 200% sem inverter a alça", () => {
    const initial = { ...placement, scale: 3 };
    const geometry = compositionMediaGeometry(asset, settings, output, initial)!;
    const next = resizeCompositionPlacement(geometry, initial, "se", { x: 270, y: 152 });
    expect(next.scale).toBeCloseTo(3.25, 8);
    expect(next.x).toBeGreaterThan(initial.x);
    expect(next.y).toBeGreaterThan(initial.y);
  });

  it("não cria bounds de mídia sem dimensões confiáveis", () => {
    expect(compositionMediaGeometry({ ...asset, width: 0 }, settings, output)).toBeNull();
  });
});
