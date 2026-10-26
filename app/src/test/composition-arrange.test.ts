import { describe, expect, it } from "vitest";
import { moveSelectionToTrack } from "../lib/composition-arrange";
import { validateComposition } from "../lib/composition";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 100, width: 1920, height: 1080, videoId: null, url: null };
  workspace.settings.trimStart = 10;
  workspace.settings.trimEnd = 12;
  workspace.transcript = [{ id: "cue", start: 10, end: 12, text: "Legenda" }];
  return compositionFromLegacy(workspace);
}

function addGroup(document: ReturnType<typeof fixture>, name: string, startFrame: number) {
  const group = document.items.filter(item => item.groupId === "source-0").map(item => ({ ...structuredClone(item), id: `${name}-${item.kind}`, groupId: name, startFrame }));
  document.items.push(...group);
  return group;
}

describe("movimento da seleção sem cópias", () => {
  it("desliga magnetismo para manter espaço e deixa todos os outros itens intactos", () => {
    const document = fixture();
    const later = addGroup(document, "later", 180);
    const before = structuredClone(document);
    const next = moveSelectionToTrack(document, [document.items[0].id], 90, "V1", { magnetic: false });
    expect(next.items.filter(item => item.groupId === "source-0").map(item => item.startFrame)).toEqual([90, 90, 90]);
    expect(next.items.filter(item => item.groupId === "later")).toEqual(later);
    expect(next.items).toHaveLength(before.items.length);
    expect(document).toEqual(before);
    expect(validateComposition(next)).toEqual([]);
  });

  it("limita colisões pelo espaço livre mais próximo em todas as faixas do grupo", () => {
    const document = fixture();
    const later = addGroup(document, "later", 120);
    const next = moveSelectionToTrack(document, [document.items[0].id], 100, "V1", { magnetic: false });
    expect(next.items.filter(item => item.groupId === "source-0").map(item => item.startFrame)).toEqual([60, 60, 60]);
    expect(next.items.filter(item => item.groupId === "later")).toEqual(later);
    expect(validateComposition(next)).toEqual([]);
  });

  it("realoca áudio vinculado sem deixar um áudio independente deslocar a nova camada visual", () => {
    const document = fixture();
    const audio = document.items.find(item => item.kind === "audio")!;
    document.items.push({ ...structuredClone(audio), id: "music", groupId: "music", startFrame: 120, followsMain: false });
    const next = moveSelectionToTrack(document, [document.items[0].id], 100, null, { magnetic: false });
    expect(next.items.filter(item => item.groupId === "source-0").map(item => item.startFrame)).toEqual([100, 100, 100]);
    expect(next.items.find(item => item.id === audio.id)?.trackId).not.toBe(audio.trackId);
    expect(next.items.find(item => item.id === "music")).toEqual(document.items[document.items.length - 1]);
  });

  it("cria camada visual acima sem recriar itens, fontes, vínculos nem configurações", () => {
    const document = fixture();
    const next = moveSelectionToTrack(document, [document.items[0].id], 30, null, { magnetic: false });
    const layer = next.tracks.find(track => !document.tracks.some(value => value.id === track.id))!;
    expect(layer).toMatchObject({ kind: "visual", primary: false, locked: false, hidden: false, muted: false });
    expect(next.tracks.indexOf(layer)).toBeGreaterThan(next.tracks.findIndex(track => track.primary));
    expect(next.assets).toBe(document.assets);
    expect(next.items).toEqual(document.items.map(item => ({ ...item, startFrame: 30, trackId: item.kind === "video" ? layer.id : item.trackId })));
  });

  it("move entre faixas existentes sem compactar a origem nem mover itens fixos não selecionados", () => {
    const document = fixture();
    document.tracks.push({ ...document.tracks[0], id: "V2", name: "Camada 2", primary: false });
    const fixed = { ...structuredClone(document.items[0]), id: "fixed", trackId: "V2", groupId: document.items[0].groupId, followsMain: false, startFrame: 300 };
    document.items.push(fixed);
    const next = moveSelectionToTrack(document, [document.items[0].id], 120, "V2", { magnetic: true });
    expect(next.items.find(item => item.id === document.items[0].id)).toMatchObject({ trackId: "V2", startFrame: 120 });
    expect(next.items.find(item => item.id === fixed.id)).toEqual(fixed);
    expect(next.items).toHaveLength(document.items.length);
    expect(validateComposition(next)).toEqual([]);
  });

  it("respeita seleção múltipla com espaçamento relativo, incluindo elemento fixo explicitamente selecionado", () => {
    const document = fixture();
    document.tracks.push({ ...document.tracks[0], id: "V2", name: "Camada 2", primary: false });
    const fixed = { ...structuredClone(document.items[0]), id: "fixed", trackId: "V2", groupId: "fixed", followsMain: false, startFrame: 180 };
    document.items.push(fixed);
    const next = moveSelectionToTrack(document, [document.items[0].id, fixed.id], 60, "V1", { magnetic: false });
    expect(next.items.find(item => item.id === fixed.id)).toMatchObject({ trackId: "V2", startFrame: 240, followsMain: false });
    expect(next.items[0].startFrame).toBe(60);
  });

  it("reordena blocos inteiros na principal com ímã e mantém identidades", () => {
    const document = fixture();
    const second = addGroup(document, "second", 60);
    const next = moveSelectionToTrack(document, [second[0].id], 0, "V1", { magnetic: true });
    expect(next.items.filter(item => item.groupId === "second").map(item => item.startFrame)).toEqual([0, 0, 0]);
    expect(next.items.filter(item => item.groupId === "source-0").map(item => item.startFrame)).toEqual([60, 60, 60]);
    expect(new Set(next.items.map(item => item.id))).toEqual(new Set(document.items.map(item => item.id)));
    expect(validateComposition(next)).toEqual([]);
  });

  it("vinte cálculos de drag não dividem nem multiplicam legenda longa atravessando blocos", () => {
    const document = fixture();
    const second = addGroup(document, "second", 60);
    addGroup(document, "third", 120);
    document.items = document.items.filter(item => item.kind !== "caption");
    const caption = { ...structuredClone(document.items[0]), id: "long-caption", kind: "caption" as const, trackId: "C1", groupId: "long", durationFrames: 180, sourceEndUs: 16_000_000 };
    document.items.push(caption);
    for (let index = 0; index < 20; index++) {
      const next = moveSelectionToTrack(document, [second[0].id], index * 10, "V1", { magnetic: true });
      expect(next.items).toHaveLength(document.items.length);
      expect(next.items.find(item => item.id === caption.id)).toEqual(caption);
      expect(new Set(next.items.map(item => item.id))).toEqual(new Set(document.items.map(item => item.id)));
      expect(validateComposition(next)).toEqual([]);
    }
  });

  it("mantém a identidade da camada nova em todos os previews do mesmo gesto", () => {
    const document = fixture();
    for (let index = 0; index < 20; index++) {
      const next = moveSelectionToTrack(document, [document.items[0].id], index * 10, null, { magnetic: false, newTrackId: "gesture-layer" });
      expect(next.tracks.filter(track => track.id === "gesture-layer")).toHaveLength(1);
      expect(next.items[0].trackId).toBe("gesture-layer");
      expect(next.items.map(item => item.id)).toEqual(document.items.map(item => item.id));
    }
    expect(() => moveSelectionToTrack(document, [document.items[0].id], 0, null, { magnetic: false, newTrackId: "V1" })).toThrow(/existente/);
  });

  it("rejeita bloqueios, destino incompatível e tempo inválido sem modificar a base", () => {
    const document = fixture();
    const before = structuredClone(document);
    expect(() => moveSelectionToTrack(document, [document.items[0].id], 0, "A1", { magnetic: false })).toThrow(/compatível/);
    expect(() => moveSelectionToTrack(document, [document.items[0].id], -1, "V1", { magnetic: false })).toThrow(/inválido/);
    expect(() => moveSelectionToTrack(document, [document.items[0].id], 0, "missing", { magnetic: false })).toThrow(/encontrada/);
    expect(document).toEqual(before);
    document.tracks.find(track => track.id === "A1")!.locked = true;
    expect(() => moveSelectionToTrack(document, [document.items[0].id], 30, null, { magnetic: false })).toThrow(/bloqueada/);
    document.tracks.find(track => track.id === "A1")!.locked = false;
    document.tracks.push({ ...document.tracks[0], id: "V2", name: "Camada 2", primary: false, locked: true });
    expect(() => moveSelectionToTrack(document, [document.items[0].id], 30, "V2", { magnetic: false })).toThrow(/bloqueada/);
  });
});
