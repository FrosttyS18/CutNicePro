import { expect, it } from "vitest";
import { prepareCaptionBatch } from "../lib/composition-batch";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { captionPresets } from "../lib/captions";

const a = "a".repeat(64), b = "b".repeat(64);
function fixture() {
  const legacy = emptyWorkspace();
  legacy.media = { kind: "local", name: "Fonte", mediaId: "source", duration: 60, width: 640, height: 360, videoId: null, url: null };
  legacy.transcriptMode = "real";
  legacy.transcript = [{ id: "s", start: 0, end: 3, text: "Uma fala" }];
  const document = compositionFromLegacy(legacy);
  document.items.find(item => item.kind === "caption")!.captionEdits.s = "Correção local";
  const other = { ...document, revision: 2 };
  return { legacy, document, other, clips: [a, b].map(id => ({ id, start: 0, end: 30, title: id, score: 80, review: "pending" as const, reasons: [] })) };
}
it("prepara estilo em snapshots sem alterar legendas, mídia ou documentos originais", () => {
  const f = fixture();
  const result = prepareCaptionBatch({ ...f, activeClipId: a, related: [], saved: { version: 1, project: null, clips: { [b]: { document: f.other, manuallyEdited: true, editedAtMs: 1 } } }, model: 2, style: captionPresets[2].style });
  expect(result.document.settings.captionModel).toBe(2);
  expect(result.related).toHaveLength(1);
  expect(result.related[0]).toMatchObject({ clipId: b, expectedRevision: 2 });
  expect(result.related[0].document.assets).toBe(f.other.assets);
  expect(result.related[0].document.items.find(item => item.kind === "caption")!.captionEdits.s).toBe("Correção local");
  expect(f.other.settings.captionModel).toBe(1);
});
it("adapta legado somente com fonte e ASR válidas e aborta se um alvo estiver bloqueado", () => {
  const f = fixture();
  const request = { ...f, activeClipId: a, related: [], saved: { version: 1 as const, project: null, clips: {} }, model: 3, style: captionPresets[3].style };
  expect(() => prepareCaptionBatch(request)).toThrow(/fonte|transcri/i);
  const source = { mediaId: "source", unavailable: false, analysis: { durationMs: 60000, width: 640, height: 360, fps: 30, hasAudio: true } };
  const seeded = prepareCaptionBatch({ ...request, source });
  expect(seeded.related[0].expectedRevision).toBe(0);
  const locked = structuredClone(f.other); locked.tracks[0].locked = true;
  expect(() => prepareCaptionBatch({ ...request, source, saved: { ...request.saved, clips: { [b]: { document: locked, manuallyEdited: true, editedAtMs: 1 } } } })).toThrow(/bloqueada/);
  expect(f.document.settings.captionModel).toBe(1);
});
it("cortes legados compartilham uma única transcrição imutável no lote", () => {
  const f = fixture();
  const clips = Array.from({ length: 100 }, (_, index) => ({ ...f.clips[0], id: (index + 1).toString(16).padStart(64, "0") }));
  const result = prepareCaptionBatch({ ...f, clips, activeClipId: null, related: [], saved: { version: 1, project: null, clips: {} }, model: 3, style: captionPresets[3].style,
    source: { mediaId: "source", unavailable: false, analysis: { durationMs: 60000, width: 640, height: 360, fps: 30, hasAudio: true } } });
  const transcripts = result.related.map(draft => draft.document.assets[0].transcript);
  expect(result.related).toHaveLength(100);
  expect(new Set(transcripts).size).toBe(1);
  expect(transcripts[0]).not.toBe(f.legacy.transcript);
  expect(transcripts[0]).toEqual(f.legacy.transcript);
});
