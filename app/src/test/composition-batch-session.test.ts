import { expect, it, vi } from "vitest";
import { CompositionSession, type CompositionPersistence } from "../lib/composition-session";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";

const id = "b".repeat(64);
const base = compositionFromLegacy(emptyWorkspace());
const style = (document: Composition, model: number) => ({ ...document, settings: { ...document.settings, captionModel: model } });
function persistence() {
  const save = vi.fn(async (document: Composition, revision: number) => ({ ...document, revision: revision + 1 }));
  const saveBatch = vi.fn<NonNullable<CompositionPersistence["saveBatch"]>>(async (document, revision, related, activeChanged) => ({
    document: activeChanged ? { ...document, revision: revision + 1 } : null,
    related: Object.fromEntries(related.map(draft => [draft.clipId, { ...draft.document, revision: draft.expectedRevision + 1 }])),
  }));
  return { save, saveBatch };
}
function batch(document = style(base, 2)) { return { document, related: [{ clipId: id, expectedRevision: 0, baseDocument: base, document: style(base, 2) }] }; }
it("lote é uma ação de Undo e edições posteriores conservam os outros rascunhos sem escrita", () => {
  const adapter = persistence(), session = new CompositionSession(base, adapter);
  session.applyBatch(batch());
  expect(session.relatedDrafts).toHaveLength(1);
  session.undo(); expect(session.dirty).toBe(false); expect(session.relatedDrafts).toHaveLength(0);
  session.redo(); expect(session.relatedDrafts).toHaveLength(1);
  session.apply({ ...session.document, settings: { ...session.document.settings, text: "Nova edição" } });
  expect(session.relatedDrafts).toHaveLength(1);
  expect(adapter.save).not.toHaveBeenCalled(); expect(adapter.saveBatch).not.toHaveBeenCalled();
});
it("ApplyAll→Save→Undo→Save→Redo→Save usa revisões atuais para restaurar todos", async () => {
  const legacy = emptyWorkspace();
  legacy.media = { kind: "local", name: "Fonte", mediaId: "source", duration: 30, width: 640, height: 360, videoId: null, url: null };
  legacy.transcript = [{ id: "s", start: 0, end: 2, text: "Fala" }];
  const original = compositionFromLegacy(legacy);
  original.items.find(item => item.kind === "caption")!.captionEdits.s = "Correção preservada";
  const adapter = persistence(), session = new CompositionSession(original, adapter);
  session.applyBatch({ document: style(original, 2), related: [{ clipId: id, expectedRevision: 0, baseDocument: original, document: style(original, 2) }] });
  expect(await session.save()).toBe(true);
  session.undo(); expect(session.relatedDrafts[0]).toMatchObject({ expectedRevision: 1, document: { settings: { captionModel: 1 } } });
  expect(await session.save()).toBe(true);
  session.redo(); expect(session.relatedDrafts[0]).toMatchObject({ expectedRevision: 2, document: { settings: { captionModel: 2 } } });
  expect(await session.save()).toBe(true);
  expect(adapter.saveBatch).toHaveBeenCalledTimes(3);
  for (const [document, , related] of adapter.saveBatch.mock.calls) {
    expect(document.items.find(item => item.kind === "caption")!.captionEdits.s).toBe("Correção preservada");
    expect(related[0].document.items.find(item => item.kind === "caption")!.captionEdits.s).toBe("Correção preservada");
  }
  expect(session.dirty).toBe(false);
});
it("lote com ativo inalterado não exige nova revisão ativa e falha mantém pendências", async () => {
  const adapter = persistence(), session = new CompositionSession(base, adapter);
  session.applyBatch(batch(base));
  adapter.saveBatch.mockRejectedValueOnce(new Error("Outro clipe foi atualizado"));
  expect(await session.save()).toBe(false); expect(session.relatedDrafts).toHaveLength(1);
  expect(await session.save()).toBe(true);
  expect(adapter.saveBatch.mock.calls[1][3]).toBe(false);
  expect(session.savedDocument.revision).toBe(0);
});
it("edição ativa durante Save permanece suja e ACK atualiza baseline dos outros", async () => {
  const adapter = persistence();
  let finish!: (value: Awaited<ReturnType<NonNullable<CompositionPersistence["saveBatch"]>>>) => void;
  adapter.saveBatch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const session = new CompositionSession(base, adapter); session.applyBatch(batch());
  const pending = session.save();
  session.apply({ ...session.document, settings: { ...session.document.settings, text: "Durante Save" } });
  finish({ document: { ...style(base, 2), revision: 1 }, related: { [id]: { ...style(base, 2), revision: 1 } } });
  expect(await pending).toBe(true); expect(session.dirty).toBe(true); expect(session.relatedDrafts).toHaveLength(0);
  expect(session.document.settings.text).toBe("Durante Save");
});
it("novos alvos e edições de lote durante Save conservam bases e revisões confirmadas", async () => {
  const adapter = persistence(), extraId = "c".repeat(64);
  let finish!: (value: Awaited<ReturnType<NonNullable<CompositionPersistence["saveBatch"]>>>) => void;
  adapter.saveBatch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const session = new CompositionSession(base, adapter); session.applyBatch(batch());
  const pending = session.save();
  session.applyBatch({ document: style(base, 3), related: [
    { clipId: id, expectedRevision: 0, baseDocument: base, document: style(base, 3) },
    { clipId: extraId, expectedRevision: 0, baseDocument: base, document: style(base, 3) },
  ] });
  finish({ document: { ...style(base, 2), revision: 1 }, related: { [id]: { ...style(base, 2), revision: 1 } } });
  expect(await pending).toBe(true);
  expect(session.relatedDocuments).toEqual(expect.arrayContaining([
    expect.objectContaining({ clipId: id, expectedRevision: 1, baseDocument: expect.objectContaining({ settings: expect.objectContaining({ captionModel: 2 }) }) }),
    expect.objectContaining({ clipId: extraId, expectedRevision: 0, baseDocument: base }),
  ]));
  expect(session.relatedDrafts).toHaveLength(2);
  expect(session.document.settings.captionModel).toBe(3);
  expect(await session.save()).toBe(true);
  expect(session.dirty).toBe(false);
  expect(adapter.saveBatch.mock.calls[1][2]).toEqual(expect.arrayContaining([
    expect.objectContaining({ clipId: id, expectedRevision: 1 }), expect.objectContaining({ clipId: extraId, expectedRevision: 0 }),
  ]));
});
