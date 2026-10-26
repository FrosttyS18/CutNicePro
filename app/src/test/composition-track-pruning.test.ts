import { expect, it } from "vitest";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { removeRange, removeSelection } from "../lib/composition-edit";
import { duplicateSelection, insertComposition, moveSelection } from "../lib/composition-insert";
import { trimSelectionAtPlayhead } from "../lib/composition-trim";
import { fragmentFromAsset } from "../lib/composition-source";
import { applyCaptionTranscript } from "../lib/composition-captions";
import { parseComposition } from "../lib/composition-boundary";
import { validateComposition } from "../lib/composition";
import { CompositionSession } from "../lib/composition-session";
import type { Composition, CompositionTrack } from "../lib/composition-types";

function fixture() {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 30, width: 640, height: 360, videoId: null, url: null };
  data.settings.trimStart = 10; data.settings.trimEnd = 20;
  data.transcript = [{ id: "s", start: 10, end: 12, text: "Legenda preservada" }];
  return compositionFromLegacy(data);
}
function addTrack(document: Composition, id: string, kind: CompositionTrack["kind"] = "visual", locked = false) {
  document.tracks.push({ id, name: id, kind, locked, primary: false, hidden: false, muted: false });
}
function duplicates(count: number) {
  let document = fixture(), selected = document.items[0].id;
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    const previous = new Set(document.items.map(item => item.id));
    document = duplicateSelection(document, [selected]);
    selected = document.items.find(item => item.kind === "video" && !previous.has(item.id))!.id;
    ids.push(selected);
  }
  return { document, ids };
}
function expectValid(document: Composition) {
  expect(validateComposition(document)).toEqual([]);
  expect(new Set(document.items.map(item => item.id)).size).toBe(document.items.length);
  expect(new Set(document.tracks.map(track => track.id)).size).toBe(document.tracks.length);
}

it("cinquenta duplicações e exclusões não acumulam faixas auxiliares vazias", () => {
  const original = fixture(), before = structuredClone(original);
  const copies = duplicates(50);
  let document = copies.document;
  expect(document.tracks).toHaveLength(153);
  for (const id of copies.ids.reverse()) {
    document = removeSelection(document, [id], false);
    expect(document.tracks.every(track => track.primary || document.items.some(item => item.trackId === track.id))).toBe(true);
    expectValid(document);
  }
  expect(document.tracks).toEqual(original.tracks);
  expect(document.items).toEqual(original.items);
  const empty = removeSelection(document, [document.items[0].id]);
  expect(empty.items).toEqual([]);
  expect(empty.tracks.map(track => track.id)).toEqual(["V1"]);
  expect(original).toEqual(before);
});

it("multisseleção repetida preserva imagem remanescente e mídias independentes", () => {
  const { document, ids } = duplicates(2);
  const video = document.items.find(item => item.id === ids[0])!;
  const image = { ...document.assets[0], id: "image", mediaId: "image", kind: "image" as const, durationUs: 0, transcript: [] };
  document.assets.push(image);
  document.items.push({ ...structuredClone(video), id: "image-item", assetId: image.id, kind: "image", groupId: "image", followsMain: false, startFrame: 400, durationFrames: 30, sourceStartUs: 0, sourceEndUs: 0 });
  for (const kind of ["audio", "caption"] as const) {
    addTrack(document, `independent-${kind}`, kind, true);
    const item = document.items.find(item => item.kind === kind)!;
    document.items.push({ ...structuredClone(item), id: `independent-${kind}`, trackId: `independent-${kind}`, groupId: `independent-${kind}`, followsMain: false });
  }
  const before = structuredClone(document);
  const next = removeSelection(document, [ids[0], ids[0], ids[1]], false);
  expect(next.tracks.some(track => track.id === video.trackId)).toBe(true);
  expect(next.items.find(item => item.id === "image-item")).toEqual(before.items.find(item => item.id === "image-item"));
  for (const kind of ["audio", "caption"]) expect(next.items.find(item => item.id === `independent-${kind}`)).toEqual(before.items.find(item => item.id === `independent-${kind}`));
  expect(next.tracks.every(track => next.items.some(item => item.trackId === track.id))).toBe(true);
  expectValid(next);
  expect(document).toEqual(before);
});

it.each([true, false])("excluir intervalo completo ripple=%s poda só faixas recém-esvaziadas", ripple => {
  const { document } = duplicates(2);
  addTrack(document, "legacy-empty");
  addTrack(document, "locked-empty", "visual", true);
  const next = removeRange(document, 0, 300, ripple);
  expect(next.items).toEqual([]);
  expect(next.tracks.map(track => track.id)).toEqual(["V1", "legacy-empty", "locked-empty"]);
  expectValid(next);
});

it("exclusão sem efeito preserva vazias antigas e lock impede exclusão do grupo", () => {
  const { document, ids } = duplicates(1);
  addTrack(document, "legacy-empty");
  expect(removeSelection(document, ["missing"]).tracks).toEqual(document.tracks);
  const video = document.items.find(item => item.id === ids[0])!;
  document.tracks.find(track => track.id === video.trackId)!.locked = true;
  const before = structuredClone(document);
  expect(() => removeSelection(document, [video.id])).toThrow(/bloqueada/);
  expect(() => removeRange(document, 0, 300)).toThrow(/bloqueada/);
  expect(document).toEqual(before);
});

it.each(["left", "right"] as const)("Q/W %s remove faixa do acompanhante totalmente aparado", side => {
  const document = fixture();
  const audio = document.items.find(item => item.kind === "audio")!;
  audio.durationFrames = 30;
  audio.sourceEndUs = 11_000_000;
  if (side === "right") audio.startFrame = 200;
  const next = trimSelectionAtPlayhead(document, [document.items[0].id], 60, side);
  expect(next.items.some(item => item.kind === "audio")).toBe(false);
  expect(next.tracks.some(track => track.id === audio.trackId)).toBe(false);
  expect(next.items.some(item => item.kind === "caption")).toBe(true);
  expectValid(next);
});

it("mover o último grupo usa as mesmas faixas e IDs sem poda intermediária", () => {
  const document = fixture();
  const next = moveSelection(document, [document.items[0].id], 600);
  expect(next.tracks).toEqual(document.tracks);
  expect(next.items.map(item => [item.id, item.trackId])).toEqual(document.items.map(item => [item.id, item.trackId]));
  expectValid(next);
});

it("undo/redo e save/reopen JSON preservam poda e permitem reinserir áudio e legendas", async () => {
  const { document, ids } = duplicates(1);
  let saved = JSON.stringify(document);
  const persistence = { save: async (next: Composition, revision: number) => { saved = JSON.stringify({ ...next, revision: revision + 1 }); return parseComposition(JSON.parse(saved)); } };
  const session = new CompositionSession(document, persistence);
  session.apply(removeSelection(session.document, ids));
  expect(session.document.tracks).toHaveLength(3);
  session.undo();
  expect(session.document.tracks).toEqual(document.tracks);
  session.redo();
  expect(session.document.tracks).toHaveLength(3);
  expect(await session.save()).toBe(true);
  const reopened = new CompositionSession(parseComposition(JSON.parse(saved)), persistence);
  reopened.apply(removeSelection(reopened.document, [reopened.document.items[0].id]));
  expect(reopened.document.tracks.map(track => track.id)).toEqual(["V1"]);
  expect(await reopened.save()).toBe(true);
  const empty = parseComposition(JSON.parse(saved));
  const asset = { ...document.assets[0], transcript: [] };
  const inserted = insertComposition(empty, fragmentFromAsset(empty, asset, 10, 20), 0);
  expect(inserted.items.filter(item => item.kind === "audio")).toHaveLength(1);
  expect(inserted.tracks.some(track => track.kind === "caption")).toBe(false);
  const captioned = applyCaptionTranscript(inserted, asset.mediaId, document.assets[0].transcript);
  expect(captioned.items.filter(item => item.kind === "caption")).toHaveLength(1);
  const duplicated = duplicateSelection(parseComposition(JSON.parse(JSON.stringify(captioned))), [captioned.items[0].id]);
  expect(duplicated.items).toHaveLength(6);
  expectValid(duplicated);
});
