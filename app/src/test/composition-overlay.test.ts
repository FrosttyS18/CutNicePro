import { expect, it } from "vitest";
import { emptyWorkspace } from "../lib/workspace";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { compositionDuration, validateComposition } from "../lib/composition";
import { duplicateSelection, overlayComposition } from "../lib/composition-insert";
import { activeItems, linkedSourceAudio } from "../lib/composition-playback";

function fixture() {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte", duration: 30, width: 640, height: 360, videoId: null, url: null };
  data.settings.trimStart = 10; data.settings.trimEnd = 20;
  data.transcript = [{ id: "s", start: 10, end: 12, text: "Texto da fonte" }];
  const document = compositionFromLegacy(data);
  document.items.find(item => item.kind === "caption")!.captionEdits.s = { text: "Texto corrigido", words: [{ text: "Texto", start: 10, end: 11 }] };
  return document;
}

it("duplicar cria uma camada acima no mesmo tempo sem deslocar ou trocar IDs existentes", () => {
  const document = fixture(), before = structuredClone(document);
  const next = duplicateSelection(document, [document.items[0].id]);
  const oldIds = new Set(document.items.map(item => item.id));
  const added = next.items.filter(item => !oldIds.has(item.id));
  expect(compositionDuration(next)).toBe(300);
  expect(added).toHaveLength(3);
  expect(next.items.filter(item => oldIds.has(item.id))).toEqual(before.items);
  expect(next.items.filter(item => oldIds.has(item.id)).every(item => document.items.includes(item))).toBe(true);
  expect(added.every(item => item.startFrame === 0 && item.durationFrames === 300 && item.sourceStartUs === 10_000_000 && item.sourceEndUs === 20_000_000 && item.followsMain)).toBe(true);
  expect(new Set(next.items.map(item => item.id)).size).toBe(6);
  expect(new Set(added.map(item => item.groupId)).size).toBe(1);
  expect(added[0].groupId).not.toBe(document.items[0].groupId);
  const video = added.find(item => item.kind === "video")!;
  expect(next.tracks.findIndex(track => track.id === video.trackId)).toBeGreaterThan(document.tracks.findIndex(track => track.id === document.items[0].trackId));
  expect(next.tracks.find(track => track.id === video.trackId)?.primary).toBe(false);
  expect(activeItems(next, 0).filter(item => item.kind === "video").map(item => item.id)).toEqual([document.items[0].id, video.id]);
  expect(linkedSourceAudio(next, video)?.groupId).toBe(video.groupId);
  expect(next.assets).toHaveLength(1);
  const caption = added.find(item => item.kind === "caption")!;
  expect(caption.captionEdits).toEqual(before.items.find(item => item.kind === "caption")!.captionEdits);
  (caption.captionEdits.s as { text: string }).text = "Alterado na cópia";
  expect(document).toEqual(before);
  expect(validateComposition(next)).toEqual([]);
});

it("colar sobrepõe no cursor com conversão de fps e preserva o conteúdo de destino", () => {
  const document = fixture();
  const fragment = fixture();
  fragment.fps = { numerator: 60, denominator: 1 };
  fragment.items = fragment.items.map(item => ({ ...item, durationFrames: 600 }));
  const next = overlayComposition(document, fragment, 150);
  const originalIds = new Set(document.items.map(item => item.id));
  const added = next.items.filter(item => !originalIds.has(item.id));
  expect(added.map(item => [item.startFrame, item.durationFrames])).toEqual([[150, 300], [150, 300], [150, 300]]);
  expect(next.items.filter(item => originalIds.has(item.id))).toEqual(document.items);
  expect(compositionDuration(next)).toBe(450);
  expect(next.assets).toHaveLength(1);
  expect(validateComposition(next)).toEqual([]);
});

it("camadas visuais copiadas mantêm ordem e áudio/legenda evitam colisões e faixas bloqueadas", () => {
  const document = fixture(), fragment = fixture();
  document.tracks.find(track => track.kind === "audio")!.locked = true;
  fragment.tracks.push({ ...fragment.tracks[0], id: "upper", name: "Camada superior", primary: false });
  fragment.items.push({ ...structuredClone(fragment.items[0]), id: "upper-video", groupId: "upper", trackId: "upper" });
  const next = overlayComposition(document, fragment, 0);
  const visuals = activeItems(next, 0).filter(item => item.kind === "video");
  expect(visuals.map(item => item.sourceStartUs)).toEqual([10_000_000, 10_000_000, 10_000_000]);
  expect(next.tracks.find(track => track.id === visuals[2].trackId)?.name).toBe("Camada superior");
  expect(next.tracks.findIndex(track => track.id === visuals[2].trackId)).toBeGreaterThan(next.tracks.findIndex(track => track.id === visuals[1].trackId));
  for (const kind of ["audio", "caption"]) {
    const added = next.items.filter(item => item.kind === kind && !document.items.some(original => original.id === item.id));
    expect(added).toHaveLength(1);
    expect(added[0].trackId).not.toBe(document.items.find(item => item.kind === kind)!.trackId);
    expect(next.tracks.find(track => track.id === added[0].trackId)?.locked).toBe(false);
  }
  expect(validateComposition(next)).toEqual([]);
});

it("duplicar respeita locks vinculados e colar nunca altera faixas bloqueadas existentes", () => {
  const document = fixture();
  document.tracks.find(track => track.kind === "caption")!.locked = true;
  expect(() => duplicateSelection(document, [document.items[0].id])).toThrow(/bloqueada/);
  const before = structuredClone(document);
  expect(overlayComposition(document, fixture(), 0).items).toHaveLength(6);
  expect(document).toEqual(before);
});
