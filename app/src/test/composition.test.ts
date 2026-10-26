import { describe, expect, it } from "vitest";
import { emptyWorkspace } from "../lib/workspace";
import { compositionDuration, validateComposition } from "../lib/composition";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { fpsFromRate, frameToSeconds, secondsToFrame } from "../lib/composition-time";

function legacy() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 300, width: 1920, height: 1080, url: null, videoId: null };
  workspace.settings.trimStart = 30;
  workspace.settings.trimEnd = 40;
  return workspace;
}

describe("montagem independente da fonte", () => {
  it("adapta um corte da fonte para a montagem em zero sem alterar o workspace", () => {
    const workspace = legacy();
    const before = JSON.stringify(workspace);
    const result = compositionFromLegacy(workspace);
    const video = result.items.find(item => item.kind === "video")!;
    expect(video.startFrame).toBe(0);
    expect(video.sourceStartUs).toBe(30_000_000);
    expect(video.durationFrames).toBe(300);
    expect(compositionDuration(result)).toBe(300);
    expect(validateComposition(result)).toEqual([]);
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it("adapta várias janelas preservando os vãos removidos e a duração de saída", () => {
    const workspace = legacy();
    workspace.settings.editPlan = { version: 1, segments: [{ sourceStart: 180, sourceEnd: 190 }, { sourceStart: 204, sourceEnd: 210 }] };
    const result = compositionFromLegacy(workspace);
    const videos = result.items.filter(item => item.kind === "video");
    expect(videos.map(item => [item.startFrame, item.durationFrames, item.sourceStartUs])).toEqual([[0, 300, 180_000_000], [300, 180, 204_000_000]]);
    expect(compositionDuration(result)).toBe(480);
  });

  it("permite repetir uma fonte e reordenar seus tempos", () => {
    const result = compositionFromLegacy(legacy());
    const video = result.items.find(item => item.kind === "video")!;
    result.items.push({ ...structuredClone(video), id: "duplicate", groupId: "duplicate-group", startFrame: 300, sourceStartUs: 0, sourceEndUs: 10_000_000 });
    expect(validateComposition(result)).toEqual([]);
    expect(compositionDuration(result)).toBe(600);
  });

  it("aceita montagem vazia e preserva seu formato", () => {
    const result = compositionFromLegacy(emptyWorkspace());
    expect(validateComposition(result)).toEqual([]);
    expect(compositionDuration(result)).toBe(0);
    expect(result.fps).toEqual({ numerator: 30, denominator: 1 });
  });

  it("não transforma referência antiga sem mídia gerenciada em montagem vazia", () => {
    const workspace = legacy();
    delete workspace.media!.mediaId;
    expect(() => compositionFromLegacy(workspace)).toThrow(/reconecte/i);
  });

  it("recusa identidade duplicada, fonte ausente, sobreposição na mesma faixa e tempo fora da fonte", () => {
    const result = compositionFromLegacy(legacy());
    const video = result.items.find(item => item.kind === "video")!;
    result.items.push({ ...structuredClone(video), sourceEndUs: 400_000_000 });
    expect(validateComposition(result).length).toBeGreaterThan(0);
    result.items = [{ ...video, assetId: "missing" }];
    expect(validateComposition(result).length).toBeGreaterThan(0);
    result.items = [video, { ...structuredClone(video), id: "other" }];
    expect(validateComposition(result).length).toBeGreaterThan(0);
  });
});

describe("tempo racional da montagem", () => {
  it("preserva 59,94 e limita apenas a taxa da montagem, não o tamanho do arquivo", () => {
    expect(fpsFromRate(60000 / 1001)).toEqual({ numerator: 60000, denominator: 1001 });
    expect(fpsFromRate(120)).toEqual({ numerator: 60, denominator: 1 });
    expect(frameToSeconds(60000, { numerator: 60000, denominator: 1001 })).toBe(1001);
    expect(secondsToFrame(1001, { numerator: 60000, denominator: 1001 })).toBe(60000);
  });
});
