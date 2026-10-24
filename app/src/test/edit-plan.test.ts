import { describe, expect, it } from "vitest";
import {
  MIN_SEGMENT, effectiveSegments, nextBoundary, normalizePlan, planDuration,
  planIsValid, removeAt, segmentIndexAt, snapSeek, splitAt, toOutputTime, toSourceTime,
} from "../lib/edit-plan";
import type { EditorSettings } from "../lib/workspace-types";

const settings = (over: Partial<EditorSettings> = {}): EditorSettings => ({
  ratio: "9:16", fit: "cover", captionModel: 0, text: "", volume: 1, muted: false,
  background: "#000000", trimStart: 10, trimEnd: 40, ...over,
});

describe("EditPlan v1 — normalização e validação", () => {
  it("plano inválido cai no intervalo único do trim (compatibilidade)", () => {
    const segs = effectiveSegments(settings({ editPlan: { version: 1, segments: [
      { sourceStart: 20, sourceEnd: 30 }, { sourceStart: 25, sourceEnd: 35 }, // sobreposição
    ] } }), 100);
    expect(segs).toEqual([{ sourceStart: 10, sourceEnd: 40 }]);
  });
  it("sem plano usa trimStart/trimEnd", () => {
    expect(effectiveSegments(settings(), 100)).toEqual([{ sourceStart: 10, sourceEnd: 40 }]);
  });
  it("plano válido é aceito ordenado", () => {
    const plan = { version: 1 as const, segments: [
      { sourceStart: 20, sourceEnd: 30 }, { sourceStart: 40, sourceEnd: 50 },
    ] };
    expect(effectiveSegments(settings({ editPlan: plan }), 100)).toEqual(plan.segments);
    expect(planIsValid(normalizePlan(plan), 100)).toBe(true);
  });
  it("rejeita segmento menor que o mínimo, fora da mídia ou desordenado", () => {
    expect(planIsValid([{ sourceStart: 0, sourceEnd: MIN_SEGMENT / 2 }], 100)).toBe(false);
    expect(planIsValid([{ sourceStart: 90, sourceEnd: 110 }], 100)).toBe(false);
    expect(planIsValid([{ sourceStart: 40, sourceEnd: 50 }, { sourceStart: 10, sourceEnd: 20 }], 100)).toBe(false);
    expect(planIsValid([], 100)).toBe(false);
  });
});

describe("EditPlan v1 — mapas sourceTime ↔ outputTime", () => {
  const segments = [
    { sourceStart: 10, sourceEnd: 20 }, // 10 s
    { sourceStart: 30, sourceEnd: 34 }, // 4 s → composição 14 s
  ];
  it("ida e volta é identidade no interior dos segmentos", () => {
    // extremos exatos de junção são ambíguos por construção (fim do anterior
    // == início do próximo no output); convenção end-exclusive testada abaixo
    for (const t of [10.01, 12.5, 19.99, 30.01, 33.9]) {
      expect(toSourceTime(segments, toOutputTime(segments, t))).toBeCloseTo(t, 6);
    }
  });
  it("junção usa convenção end-exclusive (output do fim → início do próximo)", () => {
    expect(toOutputTime(segments, 20)).toBeCloseTo(10, 6);
    expect(toSourceTime(segments, 10)).toBeCloseTo(30, 6);
  });
  it("duração da composição soma os segmentos", () => {
    expect(planDuration(segments)).toBeCloseTo(14, 6);
  });
  it("vão devolve fim acumulado do anterior no outputTime", () => {
    expect(toOutputTime(segments, 25)).toBeCloseTo(10, 6); // dentro do vão 20–30
  });
});

describe("EditPlan v1 — seek, limites e edição", () => {
  const segments = [
    { sourceStart: 10, sourceEnd: 20 }, { sourceStart: 30, sourceEnd: 40 },
  ];
  it("seek dentro do vão salta para o próximo segmento", () => {
    expect(snapSeek(segments, 25)).toBe(30);
    expect(snapSeek(segments, 15)).toBe(15);
    expect(snapSeek(segments, 45)).toBe(40); // após o fim: último frame
  });
  it("fronteira do salto aponta fim → próximo início", () => {
    expect(nextBoundary(segments, 15)).toEqual({ from: 20, to: 30 });
    expect(nextBoundary(segments, 35)).toBeNull(); // último segmento
    expect(nextBoundary(segments, 25)).toBeNull(); // vão não tem fronteira
  });
  it("divide no playhead o segmento que o contém", () => {
    expect(splitAt(segments, 15)).toEqual([
      { sourceStart: 10, sourceEnd: 15 }, { sourceStart: 15, sourceEnd: 20 }, { sourceStart: 30, sourceEnd: 40 },
    ]);
    expect(splitAt(segments, 25)).toBeNull(); // vão
    expect(splitAt(segments, 10.02)).toBeNull(); // borda mínima
  });
  it("remove o segmento do playhead preservando pelo menos um", () => {
    expect(removeAt(segments, 15)).toEqual([{ sourceStart: 30, sourceEnd: 40 }]);
    expect(removeAt(segments, 25)).toBeNull();
    expect(removeAt([{ sourceStart: 10, sourceEnd: 20 }], 15)).toBeNull();
  });
  it("índice do segmento tolera epsilons de fronteira", () => {
    expect(segmentIndexAt(segments, 20.000001)).toBe(0);
    expect(segmentIndexAt(segments, 30)).toBe(1);
    expect(segmentIndexAt(segments, 25)).toBe(-1);
  });
});
