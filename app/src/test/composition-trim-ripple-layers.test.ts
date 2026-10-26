import { expect, it } from "vitest";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { trimSelection } from "../lib/composition-trim";
import { validateComposition } from "../lib/composition";
import { CompositionSession } from "../lib/composition-session";
import { parseComposition } from "../lib/composition-boundary";
import type { Composition, CompositionItem } from "../lib/composition-types";

function fixture(magnetic = true, lockedLayers = false) {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 100, width: 640, height: 360, videoId: null, url: null };
  data.settings.trimStart = 10; data.settings.trimEnd = 20;
  data.transcript = [{ id: "s", start: 10, end: 20, text: "Legenda original" }];
  const document = compositionFromLegacy(data);
  const nextStart = magnetic ? 300 : 400;
  document.items.push(...document.items.map(item => ({ ...structuredClone(item), id: `${item.id}-later`, groupId: "later", startFrame: nextStart, sourceStartUs: 20_000_000, sourceEndUs: 30_000_000 })));
  document.assets.push({ ...document.assets[0], id: "image", mediaId: "image", kind: "image", durationUs: 0, transcript: [] });
  const add = (kind: CompositionItem["kind"], startFrame: number, durationFrames: number, followsMain: boolean) => {
    const id = `independent-${kind}`;
    document.tracks.push({ id, name: id, kind: kind === "video" || kind === "image" ? "visual" : kind, primary: false, locked: lockedLayers, muted: kind === "audio", hidden: kind === "caption" });
    document.items.push({ ...structuredClone(document.items[0]), id, trackId: id, assetId: kind === "image" ? "image" : "source", kind, groupId: id, startFrame, durationFrames,
      sourceStartUs: kind === "image" ? 0 : 10_000_000, sourceEndUs: kind === "image" ? 0 : 10_000_000 + Math.round(durationFrames / 30 * 1_000_000),
      followsMain, settings: { ...structuredClone(document.settings), volume: 0.4, muted: kind === "audio" }, captionEdits: kind === "caption" ? { s: "Correção independente" } : {} });
  };
  add("video", 270, 20, true);
  add("image", 235, 90, true);
  add("audio", 330, 30, true);
  add("caption", 260, 20, true);
  document.tracks.push({ ...document.tracks[3], id: "fixed", name: "Fixo", locked: true });
  document.items.push({ ...structuredClone(document.items.find(item => item.id === "independent-video")!), id: "fixed", trackId: "fixed", groupId: "fixed", followsMain: false });
  return document;
}

it.each([
  ["start", 60, true], ["start", -60, true], ["end", 60, true], ["end", -60, true],
  ["start", 60, false], ["start", -60, false], ["end", 60, false], ["end", -60, false],
] as const)("trim %s delta %s ímã %s preserva integralmente camadas independentes", (edge, delta, magnetic) => {
  const document = fixture(magnetic), before = structuredClone(document);
  const next = trimSelection(document, document.items[0].id, edge, delta, { magnetic });
  expect(next.items.filter(item => item.id.startsWith("independent-") || item.id === "fixed")).toEqual(before.items.filter(item => item.id.startsWith("independent-") || item.id === "fixed"));
  expect(next.tracks).toEqual(before.tracks);
  expect(next.items.map(item => item.id)).toEqual(before.items.map(item => item.id));
  const shift = magnetic && (edge === "end" || delta < 0) ? edge === "start" ? -delta : delta : 0;
  expect(next.items.filter(item => item.groupId === "later")).toEqual(before.items.filter(item => item.groupId === "later").map(item => ({ ...item, startFrame: item.startFrame + shift })));
  expect(validateComposition(next)).toEqual([]);
  expect(document).toEqual(before);
});

it.each([["start", -60], ["end", 60], ["end", -60]] as const)("camadas independentes bloqueadas não impedem trim %s %s da principal", (edge, delta) => {
  const document = fixture(true, true), before = structuredClone(document);
  const next = trimSelection(document, document.items[0].id, edge, delta, { magnetic: true });
  expect(next.items.filter(item => item.id.startsWith("independent-"))).toEqual(before.items.filter(item => item.id.startsWith("independent-")));
  expect(next.tracks).toEqual(before.tracks);
  expect(validateComposition(next)).toEqual([]);
});

it("lock do alvo ou de bloco posterior realmente deslocado rejeita sem alterar dados", () => {
  const document = fixture();
  document.tracks[0].locked = true;
  let before = structuredClone(document);
  expect(() => trimSelection(document, document.items[0].id, "end", -60)).toThrow(/bloqueada/);
  expect(document).toEqual(before);
  document.tracks[0].locked = false;
  document.tracks.push({ ...document.tracks[1], id: "later-audio", locked: true });
  document.items.find(item => item.id === "source-0-audio-later")!.trackId = "later-audio";
  before = structuredClone(document);
  expect(() => trimSelection(document, document.items[0].id, "end", -60)).toThrow(/bloqueada/);
  expect(document).toEqual(before);
});

it("bloco posterior fixo na principal impede ripple sem perder sincronismo dos acompanhantes", () => {
  const document = fixture();
  document.items.find(item => item.id === "source-0-video-later")!.followsMain = false;
  const before = structuredClone(document);
  expect(() => trimSelection(document, document.items[0].id, "end", -60)).toThrow(/fixo/);
  const free = trimSelection(document, document.items[0].id, "end", -60, { magnetic: false });
  expect(free.items.filter(item => item.groupId === "later")).toEqual(before.items.filter(item => item.groupId === "later"));
  expect(free.items[0].durationFrames).toBe(240);
  expect(validateComposition(free)).toEqual([]);
  expect(document).toEqual(before);
});

it("trim de camada superior não altera grupo principal e Undo/Redo/JSON preservam a correção", () => {
  const document = fixture(), before = structuredClone(document);
  const overlay = document.items.find(item => item.id === "independent-video")!;
  const layerTrim = trimSelection(document, overlay.id, "start", 1, { magnetic: true });
  expect(layerTrim.items.filter(item => item.id !== overlay.id)).toEqual(before.items.filter(item => item.id !== overlay.id));
  const session = new CompositionSession(document, { save: async (next: Composition, revision: number) => ({ ...next, revision: revision + 1 }) });
  session.apply(trimSelection(document, document.items[0].id, "end", -60));
  const edited = structuredClone(session.document);
  expect(edited.items.find(item => item.id === "independent-video")).toEqual(overlay);
  session.undo(); expect(session.document).toEqual(before);
  session.redo(); expect(session.document).toEqual(edited);
  expect(parseComposition(JSON.parse(JSON.stringify(session.document)))).toEqual(edited);
});
