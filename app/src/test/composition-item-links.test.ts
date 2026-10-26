import { expect, it } from "vitest";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { splitSelection } from "../lib/composition-edit";
import { duplicateSelection } from "../lib/composition-insert";
import { linkedSourceCaptions, sourceVideoForCaption } from "../lib/composition-item-links";

function fixture() {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte", duration: 10, width: 640, height: 360, videoId: null, url: null };
  data.transcript = [{ id: "s", start: 0, end: 3, text: "Texto da fonte" }];
  const document = compositionFromLegacy(data);
  document.items.find(item => item.kind === "caption")!.captionEdits.s = "Correção local";
  return document;
}

it("resolve legenda vinculada nos dois sentidos sem mudar documentos, faixas ou correções", () => {
  const document = fixture(), before = structuredClone(document);
  const video = document.items.find(item => item.kind === "video")!;
  const caption = document.items.find(item => item.kind === "caption")!;
  expect(sourceVideoForCaption(document, caption)).toBe(video);
  expect(linkedSourceCaptions(document, video)).toEqual([caption]);
  expect(document).toEqual(before);
});

it("preserva o vínculo real após split e duplicação em camada no mesmo tempo", () => {
  const source = fixture();
  const split = splitSelection(source, [source.items[0].id], 120);
  const document = duplicateSelection(split, [split.items[0].id]);
  const captions = document.items.filter(item => item.kind === "caption");
  expect(captions).toHaveLength(3);
  for (const caption of captions) {
    const video = sourceVideoForCaption(document, caption)!;
    expect(video).toBeDefined();
    expect(linkedSourceCaptions(document, video)).toEqual([caption]);
    expect([video.groupId, video.assetId, video.startFrame, video.durationFrames, video.sourceStartUs, video.sourceEndUs])
      .toEqual([caption.groupId, caption.assetId, caption.startFrame, caption.durationFrames, caption.sourceStartUs, caption.sourceEndUs]);
    expect(caption.captionEdits.s).toBe("Correção local");
  }
  expect(new Set(captions.map(caption => sourceVideoForCaption(document, caption)!.id)).size).toBe(3);
});

it.each([
  { followsMain: false }, { groupId: "independente" }, { assetId: "outra-fonte" },
  { startFrame: 1 }, { durationFrames: 299 }, { sourceStartUs: 1 }, { sourceEndUs: 9_999_999 },
])("mantém legenda independente ou com intervalo diferente acessível (%j)", patch => {
  const document = fixture(), video = document.items.find(item => item.kind === "video")!;
  const caption = document.items.find(item => item.kind === "caption")!;
  Object.assign(caption, patch);
  expect(sourceVideoForCaption(document, caption)).toBeUndefined();
  expect(linkedSourceCaptions(document, video)).toEqual([]);
});

it.each(["hidden", "locked"] as const)("mantém faixa de legenda %s acessível separadamente", flag => {
  const document = fixture(), video = document.items.find(item => item.kind === "video")!;
  const caption = document.items.find(item => item.kind === "caption")!;
  document.tracks.find(track => track.id === caption.trackId)![flag] = true;
  expect(sourceVideoForCaption(document, caption)).toBeUndefined();
  expect(linkedSourceCaptions(document, video)).toEqual([]);
});

it("ocultar o vídeo preserva seu vínculo e pareamento ambíguo mantém legendas independentes", () => {
  const document = fixture(), video = document.items.find(item => item.kind === "video")!;
  const caption = document.items.find(item => item.kind === "caption")!;
  document.tracks.find(track => track.id === video.trackId)!.hidden = true;
  expect(sourceVideoForCaption(document, caption)).toBe(video);
  document.tracks.find(track => track.id === video.trackId)!.hidden = false;
  document.tracks.push({ ...document.tracks[0], id: "V2", primary: false });
  document.items.push({ ...video, id: "outro-video", trackId: "V2" });
  expect(sourceVideoForCaption(document, caption)).toBeUndefined();
  expect(linkedSourceCaptions(document, video)).toEqual([]);
});

it("aceita múltiplas legendas exatas do mesmo vídeo e mute de áudio não desfaz CC", () => {
  const document = fixture(), video = document.items.find(item => item.kind === "video")!;
  const caption = document.items.find(item => item.kind === "caption")!;
  document.tracks.push({ ...document.tracks.find(track => track.id === caption.trackId)!, id: "C2" });
  document.items.push({ ...structuredClone(caption), id: "outra-legenda", trackId: "C2" });
  document.tracks.find(track => track.id === video.trackId)!.muted = true;
  const captions = linkedSourceCaptions(document, video);
  expect(captions).toHaveLength(2);
  expect(captions.every(item => sourceVideoForCaption(document, item) === video)).toBe(true);
  expect(sourceVideoForCaption(document, video)).toBeUndefined();
  expect(linkedSourceCaptions(document, caption)).toEqual([]);
});
