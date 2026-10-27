import { describe, expect, it } from "vitest";
import { compositionMediaGeometry, type CompositionMediaGeometry } from "../lib/composition-media-geometry";
import { snapCompositionPlacement } from "../lib/composition-preview-snap";
import { defaultEditorSettings } from "../lib/workspace";
import type { CompositionAsset, CompositionPlacement } from "../lib/composition-types";

const initial: CompositionPlacement = { x: 50, y: 50, scale: 0.5, opacity: 0.6 };
const viewport = { width: 1000, height: 500 };
const bounds = { left: 250, top: 125, width: 500, height: 250 };
const geometry: CompositionMediaGeometry = { output: viewport, content: bounds, visible: bounds, bounds };

describe("encaixe visual de objetos na prévia", () => {
  it("encaixa os dois centros dentro de seis pixels sem alterar escala ou opacidade", () => {
    const candidate = { ...initial, x: 50.5, y: 49.2 };
    expect(snapCompositionPlacement(geometry, initial, candidate, viewport)).toEqual({ placement: initial, guides: { x: 500, y: 250 } });
    expect(candidate).toEqual({ x: 50.5, y: 49.2, scale: 0.5, opacity: 0.6 });
  });

  it("usa o zoom real da prévia em vez de fixar uma distância percentual", () => {
    const candidate = { ...initial, x: 50.5, y: 49.2 };
    const enlarged = { width: 4000, height: 2000 };
    expect(snapCompositionPlacement(geometry, initial, candidate, enlarged)).toEqual({ placement: candidate, guides: {} });
    expect(snapCompositionPlacement(geometry, initial, { ...initial, x: 50.1, y: 49.8 }, enlarged)).toEqual({ placement: initial, guides: { x: 500, y: 250 } });
  });

  it.each([
    [25.4, 25.8, 25, 25, 0, 0],
    [74.6, 74.2, 75, 75, 1000, 500],
    [25.4, 74.2, 25, 75, 0, 500],
    [74.6, 25.8, 75, 25, 1000, 0],
  ])("encaixa o canto próximo (%s,%s) sem aproximar o centro a uma borda", (x, y, expectedX, expectedY, guideX, guideY) => {
    const result = snapCompositionPlacement(geometry, initial, { ...initial, x, y }, viewport);
    expect(result.placement.x).toBeCloseTo(expectedX, 10);
    expect(result.placement.y).toBeCloseTo(expectedY, 10);
    expect(result.guides).toEqual({ x: guideX, y: guideY });
  });

  it("seleciona a borda mais próxima quando mais de um alinhamento cabe no limiar", () => {
    const rect = { left: 1, top: 125, width: 998, height: 250 };
    const result = snapCompositionPlacement({ ...geometry, bounds: rect }, initial, { ...initial, x: 50.4 }, viewport);
    expect(result.placement.x).toBeCloseTo(50.1, 10);
    expect(result.guides).toEqual({ x: 1000, y: 250 });
  });

  it("não altera a posição quando a distância visual excede o limiar em ambos os eixos", () => {
    const candidate = { ...initial, x: 52, y: 54 };
    expect(snapCompositionPlacement(geometry, initial, candidate, viewport)).toEqual({ placement: candidate, guides: {} });
  });

  it("avalia cada eixo com a escala visual correspondente em quadros de outra proporção", () => {
    const candidate = { ...initial, x: 50.5, y: 48 };
    const result = snapCompositionPlacement(geometry, initial, candidate, { width: 2000, height: 250 });
    expect(result.placement).toEqual({ ...candidate, y: 50 });
    expect(result.guides).toEqual({ y: 250 });
  });

  it("usa os limites da mídia contain e não a caixa vazia do quadro", () => {
    const asset: CompositionAsset = { id: "image", mediaId: "image", name: "Foto.png", kind: "image", width: 1920, height: 1080, durationUs: 0, transcript: [] };
    const settings = { ...defaultEditorSettings(), fit: "contain" as const };
    const output = { width: 1080, height: 1920 };
    const current = compositionMediaGeometry(asset, settings, output, initial)!;
    const result = snapCompositionPlacement(current, initial, { ...initial, x: 25.2, y: 8.1 }, output);
    expect(result.placement.x).toBeCloseTo(25, 10);
    expect(result.placement.y).toBeCloseTo(152 / 1920 * 100, 10);
    expect(result.guides).toEqual({ x: 0, y: 0 });
  });

  it("encaixa os limites do quadro recortado cover sem usar os pixels fora do recorte", () => {
    const asset: CompositionAsset = { id: "video", mediaId: "video", name: "Fonte.mp4", kind: "video", width: 1920, height: 1080, durationUs: 1e6, transcript: [] };
    const settings = { ...defaultEditorSettings(), fit: "cover" as const };
    const output = { width: 1080, height: 1920 };
    const current = compositionMediaGeometry(asset, settings, output, initial)!;
    const result = snapCompositionPlacement(current, initial, { ...initial, x: 25.2, y: 25.2 }, output);
    expect(result.placement).toEqual({ ...initial, x: 25, y: 25 });
    expect(result.guides).toEqual({ x: 0, y: 0 });
  });

  it("não anuncia alinhamento que exigiria uma posição fora de 0 a 100", () => {
    const candidate = { ...initial, x: 0, y: 60 };
    const rect = { left: 504, top: 125, width: 100, height: 250 };
    expect(snapCompositionPlacement({ ...geometry, bounds: rect }, initial, candidate, viewport)).toEqual({ placement: candidate, guides: {} });
  });

  it("aceita limiar zero para alinhamento exato e um limiar explícito menor", () => {
    expect(snapCompositionPlacement(geometry, initial, initial, viewport, 0)).toEqual({ placement: initial, guides: { x: 500, y: 250 } });
    const candidate = { ...initial, x: 50.5, y: 49.2 };
    expect(snapCompositionPlacement(geometry, initial, candidate, viewport, 3)).toEqual({ placement: candidate, guides: {} });
  });

  it.each([
    { output: { width: 0, height: 500 } },
    { bounds: { ...bounds, width: Number.NaN } },
    { bounds: { ...bounds, left: Number.NaN } },
  ])("ignora geometria inválida sem produzir novas coordenadas inválidas", invalid => {
    const candidate = { ...initial, x: 50.5, y: 49.2 };
    expect(snapCompositionPlacement({ ...geometry, ...invalid }, initial, candidate, viewport)).toEqual({ placement: candidate, guides: {} });
  });

  it.each([
    [{ ...initial, x: Number.NaN }, initial, viewport, 6],
    [initial, { ...initial, y: Number.NaN }, viewport, 6],
    [initial, { ...initial, x: -1 }, viewport, 6],
    [initial, initial, { width: 0, height: 500 }, 6],
    [initial, initial, viewport, Number.NaN],
    [initial, initial, viewport, -1],
  ] as const)("ignora entradas inválidas", (origin, candidate, size, threshold) => {
    expect(snapCompositionPlacement(geometry, origin, candidate, size, threshold)).toEqual({ placement: candidate, guides: {} });
  });
});
