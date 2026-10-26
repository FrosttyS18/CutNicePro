import { describe, expect, it } from "vitest";
import { itemEnd, validateComposition } from "../lib/composition";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { trimDeltaBounds } from "../lib/composition-gesture";
import { trimSelection } from "../lib/composition-trim";
import { emptyWorkspace } from "../lib/workspace";

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 100, width: 1920, height: 1080, videoId: null, url: null };
  workspace.settings.trimStart = 10;
  workspace.settings.trimEnd = 20;
  workspace.transcript = [{ id: "cue", start: 10, end: 20, text: "Legenda" }];
  const document = compositionFromLegacy(workspace);
  document.items = document.items.map(item => ({ ...item, startFrame: 60 }));
  return document;
}

describe("alças sem inversão nem perda dos espaços", () => {
  it.each([true, false])("move a borda inicial à esquerda com ímã %s e mantém a direita e as fontes vinculadas", magnetic => {
    const document = fixture();
    const before = structuredClone(document);
    const next = trimSelection(document, document.items[0].id, "start", -30, { magnetic });
    expect(next.items.map(item => [item.id, item.startFrame, item.durationFrames, item.sourceStartUs, item.sourceEndUs, itemEnd(item)]))
      .toEqual(before.items.map(item => [item.id, 30, 330, 9_000_000, 20_000_000, 360]));
    expect(document).toEqual(before);
    expect(validateComposition(next)).toEqual([]);
  });

  it.each([true, false])("aparar o início à direita preserva o fim e não desloca outro trecho com ímã %s", magnetic => {
    const document = fixture();
    const later = document.items.map(item => ({ ...structuredClone(item), id: `${item.id}-later`, groupId: "later", startFrame: 420 }));
    document.items.push(...later);
    const next = trimSelection(document, document.items[0].id, "start", 30, { magnetic });
    expect(next.items.filter(item => item.groupId !== "later").map(item => [item.startFrame, item.durationFrames, itemEnd(item), item.sourceStartUs]))
      .toEqual([[90, 270, 360, 11_000_000], [90, 270, 360, 11_000_000], [90, 270, 360, 11_000_000]]);
    expect(next.items.filter(item => item.groupId === "later")).toEqual(later);
  });

  it("limita a alça inicial por zero e pelo vizinho de cada membro associado", () => {
    const document = fixture();
    const audio = document.items.find(item => item.kind === "audio")!;
    document.items.push({ ...structuredClone(audio), id: "previous", groupId: "previous", startFrame: 0, durationFrames: 45, sourceEndUs: 11_500_000 });
    for (const magnetic of [true, false]) {
      expect(trimDeltaBounds(document, document.items[0], "start", { magnetic })).toEqual([-15, 299]);
      expect(() => trimSelection(document, document.items[0].id, "start", -16, { magnetic })).toThrow();
    }
    document.items = document.items.filter(item => item.id !== "previous").map(item => ({ ...item, startFrame: 0, sourceStartUs: 0, sourceEndUs: 10_000_000 }));
    expect(trimDeltaBounds(document, document.items[0], "start")[0]).toBe(0);
    expect(() => trimSelection(document, document.items[0].id, "start", -1)).toThrow();
  });

  it("estende o fim no modo livre somente até o vizinho, preservando a lacuna restante", () => {
    const document = fixture();
    const video = document.items[0];
    document.items.push({ ...structuredClone(video), id: "later", groupId: "later", startFrame: 420 });
    expect(trimDeltaBounds(document, video, "end", { magnetic: false })[1]).toBe(60);
    const next = trimSelection(document, video.id, "end", 30, { magnetic: false });
    expect(next.items[0].startFrame).toBe(60);
    expect(itemEnd(next.items[0])).toBe(390);
    expect(next.items.find(item => item.id === "later")?.startFrame).toBe(420);
    expect(() => trimSelection(document, video.id, "end", 61, { magnetic: false })).toThrow();
  });

  it("mantém bloqueios dos membros e permite reduzir imagem sem tempo de fonte", () => {
    const document = fixture();
    document.tracks.find(track => track.kind === "caption")!.locked = true;
    expect(() => trimSelection(document, document.items[0].id, "start", 1, { magnetic: false })).toThrow(/bloqueada/);
    document.items = [{ ...document.items[0], kind: "image", sourceStartUs: 0, sourceEndUs: 0 }];
    document.assets[0].kind = "image";
    const next = trimSelection(document, document.items[0].id, "start", -30, { magnetic: false });
    expect(next.items[0]).toMatchObject({ startFrame: 30, durationFrames: 330, sourceStartUs: 0, sourceEndUs: 0 });
  });

  it("recupera conteúdo anterior ao corte da IA no zero e desloca os próximos vínculos com ímã", () => {
    const document = fixture();
    document.items = document.items.map(item => ({ ...item, startFrame: 0 }));
    const later = document.items.map(item => ({ ...structuredClone(item), id: `${item.id}-later`, groupId: "later", startFrame: 300 }));
    document.items.push(...later);
    expect(trimDeltaBounds(document, document.items[0], "start", { magnetic: true })[0]).toBe(-300);
    const next = trimSelection(document, document.items[0].id, "start", -150, { magnetic: true });
    expect(next.items.filter(item => item.groupId !== "later").map(item => [item.startFrame, item.durationFrames, item.sourceStartUs, item.sourceEndUs]))
      .toEqual([[0, 450, 5_000_000, 20_000_000], [0, 450, 5_000_000, 20_000_000], [0, 450, 5_000_000, 20_000_000]]);
    expect(next.items.filter(item => item.groupId === "later")).toEqual(later.map(item => ({ ...item, startFrame: 450 })));
    expect(next.items.map(item => item.id)).toEqual(document.items.map(item => item.id));
    expect(() => trimSelection(document, document.items[0].id, "start", -301, { magnetic: true })).toThrow();
    expect(validateComposition(next)).toEqual([]);
  });

  it("recupera no zero sem ímã somente dentro da lacuna disponível, sem mover o próximo trecho", () => {
    const document = fixture();
    document.items = document.items.map(item => ({ ...item, startFrame: 0 }));
    const later = document.items.map(item => ({ ...structuredClone(item), id: `${item.id}-later`, groupId: "later", startFrame: 360 }));
    document.items.push(...later);
    expect(trimDeltaBounds(document, document.items[0], "start", { magnetic: false })[0]).toBe(-60);
    const next = trimSelection(document, document.items[0].id, "start", -30, { magnetic: false });
    expect(next.items.filter(item => item.groupId !== "later").map(item => [item.startFrame, item.durationFrames, item.sourceStartUs, item.sourceEndUs]))
      .toEqual([[0, 330, 9_000_000, 20_000_000], [0, 330, 9_000_000, 20_000_000], [0, 330, 9_000_000, 20_000_000]]);
    expect(next.items.filter(item => item.groupId === "later")).toEqual(later);
    expect(() => trimSelection(document, document.items[0].id, "start", -61, { magnetic: false })).toThrow();
    expect(validateComposition(next)).toEqual([]);
  });
});
