import { describe, expect, it } from "vitest";
import { validateComposition } from "../lib/composition";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { montageTranscript } from "../lib/composition-playback";
import { trimSelectionAtPlayhead } from "../lib/composition-trim";
import { emptyWorkspace } from "../lib/workspace";

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 100, width: 1920, height: 1080, videoId: null, url: null };
  workspace.settings.trimStart = 10;
  workspace.settings.trimEnd = 20;
  workspace.transcript = [{ id: "before", start: 10, end: 12, text: "Antes" }, { id: "after", start: 14, end: 16, text: "Depois" }];
  const document = compositionFromLegacy(workspace);
  document.tracks.push({ ...document.tracks[0], id: "V2", name: "Camada 2", primary: false });
  document.items.push({ ...structuredClone(document.items[0]), id: "overlay", groupId: "overlay", trackId: "V2", followsMain: false });
  return document;
}

describe("excluir um lado da seleção no cursor", () => {
  it.each(["left", "right"] as const)("corta somente o vídeo escolhido e seus vínculos à %s, mantendo espaço e outra camada", side => {
    const document = fixture();
    const before = structuredClone(document);
    const next = trimSelectionAtPlayhead(document, [document.items[0].id], 90, side);
    const expected = side === "left" ? [90, 210, 13_000_000, 20_000_000] : [0, 90, 10_000_000, 13_000_000];
    expect(next.items.filter(item => item.groupId === "source-0").map(item => [item.startFrame, item.durationFrames, item.sourceStartUs, item.sourceEndUs]))
      .toEqual([expected, expected, expected]);
    expect(next.items.find(item => item.id === "overlay")).toEqual(before.items.find(item => item.id === "overlay"));
    expect(next.assets).toBe(document.assets);
    expect(next.items.map(item => item.id)).toEqual(document.items.map(item => item.id));
    expect(validateComposition(next)).toEqual([]);
    expect(document).toEqual(before);
  });

  it("não apaga item inteiro nas bordas, fora dele, sem seleção ou selecionando somente áudio", () => {
    const document = fixture();
    for (const frame of [0, 300, 600]) for (const side of ["left", "right"] as const) {
      expect(trimSelectionAtPlayhead(document, [document.items[0].id], frame, side)).toBe(document);
    }
    expect(trimSelectionAtPlayhead(document, [], 90, "left")).toBe(document);
    expect(trimSelectionAtPlayhead(document, [document.items[1].id], 90, "left")).toBe(document);
    expect(() => trimSelectionAtPlayhead(document, [document.items[0].id], -1, "left")).toThrow(/inválido/);
  });

  it("recorta várias camadas explicitamente selecionadas e respeita imagem sem fonte temporal", () => {
    const document = fixture();
    const overlay = document.items.find(item => item.id === "overlay")!;
    document.assets.push({ ...document.assets[0], id: "image", mediaId: "image", name: "image.png", kind: "image", durationUs: 0 });
    overlay.assetId = "image"; overlay.kind = "image"; overlay.sourceStartUs = 0; overlay.sourceEndUs = 0;
    const next = trimSelectionAtPlayhead(document, [document.items[0].id, overlay.id], 90, "left");
    expect(next.items.find(item => item.id === overlay.id)).toMatchObject({ startFrame: 90, durationFrames: 210, sourceStartUs: 0, sourceEndUs: 0, followsMain: false });
    expect(next.items).toHaveLength(document.items.length);
    expect(validateComposition(next)).toEqual([]);
  });

  it("limita as legendas ao trecho mantido, preserva correções e remove apenas caption inteiramente aparada", () => {
    const document = fixture();
    const caption = document.items.find(item => item.kind === "caption")!;
    caption.captionEdits.after = "Correção";
    const next = trimSelectionAtPlayhead(document, [document.items[0].id], 90, "left");
    expect(montageTranscript(next).filter(entry => entry.itemId === caption.id).map(entry => entry.segment))
      .toEqual([expect.objectContaining({ start: 4, end: 6, text: "Correção" })]);
    expect(next.items.find(item => item.id === caption.id)?.captionEdits).toEqual(caption.captionEdits);
    caption.durationFrames = 60; caption.sourceEndUs = 12_000_000;
    const shorter = trimSelectionAtPlayhead(document, [document.items[0].id], 90, "left");
    expect(shorter.items.some(item => item.id === caption.id)).toBe(false);
    expect(shorter.items.find(item => item.id === document.items[0].id)?.durationFrames).toBe(210);
    expect(validateComposition(shorter)).toEqual([]);
  });

  it("preserva elemento fixo não selecionado e rejeita qualquer vínculo bloqueado", () => {
    const document = fixture();
    const audio = document.items.find(item => item.kind === "audio")!;
    audio.followsMain = false;
    const next = trimSelectionAtPlayhead(document, [document.items[0].id], 90, "right");
    expect(next.items.find(item => item.id === audio.id)).toEqual(audio);
    document.tracks.find(track => track.id === "C1")!.locked = true;
    expect(() => trimSelectionAtPlayhead(document, [document.items[0].id], 90, "right")).toThrow(/bloqueada/);
  });
});
