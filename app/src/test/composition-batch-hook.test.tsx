import { act, useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCompositionEditor } from "../hooks/useCompositionEditor";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { captionPresets } from "../lib/captions";
import { reactHost } from "./react-host";
import type { Composition } from "../lib/composition-types";
import { applyMontageCaptionStyle } from "../lib/composition-captions";

vi.mock("../lib/ipc", () => ({ loadEditorProject: vi.fn(), getEditorRecovery: vi.fn(), getMedia: vi.fn(), saveEditorDocument: vi.fn(), saveEditorBatch: vi.fn(), saveEditorRecovery: vi.fn(), discardEditorRecovery: vi.fn() }));
const ipc = await import("../lib/ipc");
const id = "b".repeat(64);
const legacy = emptyWorkspace(); legacy.media = { kind: "local", mediaId: "source", name: "Fonte", duration: 30, width: 640, height: 360, videoId: null, url: null };
legacy.transcriptMode = "real"; legacy.transcript = [{ id: "s", start: 0, end: 2, text: "Uma fala" }];
const other = { ...compositionFromLegacy(legacy), revision: 1 };
other.items.find(item => item.kind === "caption")!.captionEdits.s = "Correção local";
const clip = { id, start: 0, end: 30, title: "Clipe", score: 80, reasons: [], review: "pending" as const };
let editor!: ReturnType<typeof useCompositionEditor>;
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
beforeEach(() => {
  vi.mocked(ipc.saveEditorRecovery).mockResolvedValue(undefined);
  vi.mocked(ipc.discardEditorRecovery).mockResolvedValue(undefined);
  vi.mocked(ipc.loadEditorProject).mockResolvedValue({ version: 1, project: null, clips: { [id]: { document: other, manuallyEdited: true, editedAtMs: 1 } } });
  vi.mocked(ipc.getEditorRecovery).mockResolvedValue(null);
  vi.mocked(ipc.getMedia).mockResolvedValue({ mediaId: "source", unavailable: false, analysis: { fps: 30, hasAudio: true, width: 640, height: 360, durationMs: 30000 } } as Awaited<ReturnType<typeof ipc.getMedia>>);
  vi.mocked(ipc.saveEditorBatch).mockImplementation(async (_project, _clip, document, revision, related, activeChanged) => ({ snapshot: activeChanged ? { document: { ...document, revision: revision + 1 }, manuallyEdited: false, editedAtMs: 1 } : null,
    related: Object.fromEntries(related.map(draft => [draft.clipId, { document: { ...draft.document, revision: draft.expectedRevision + 1 }, manuallyEdited: true, editedAtMs: 1 }])) }));
});
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.useRealTimers(); vi.resetAllMocks(); });
function Probe() {
  const current = useCompositionEditor({ projectId: "p", clipId: null }, legacy);
  useLayoutEffect(() => { editor = current; }, [current]);
  return null;
}
it("aplicar todos muda só rascunho, Undo cancela e Save envia um único lote tipado", async () => {
  mounted = await reactHost(<Probe />);
  await act(async () => { expect(await editor.applyAllCaptions([clip], 3, captionPresets[3].style)).toBe(true); });
  expect(ipc.saveEditorBatch).not.toHaveBeenCalled(); expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await act(async () => editor.undo()); expect(editor.dirty).toBe(false);
  await act(async () => editor.redo()); expect(editor.dirty).toBe(true);
  await act(async () => { expect(await editor.save()).toBe(true); });
  expect(ipc.saveEditorBatch).toHaveBeenCalledTimes(1);
  expect(ipc.saveEditorBatch).toHaveBeenCalledWith("p", null, expect.any(Object), 0, [{ clipId: id, expectedRevision: 1, document: expect.any(Object) }], true);
  const related = vi.mocked(ipc.saveEditorBatch).mock.calls[0][4];
  expect(related[0].document.items.find(item => item.kind === "caption")!.captionEdits.s).toBe("Correção local");
});
it("recuperação inclui bases do lote e reabrir permite Undo sem escrita", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  mounted = await reactHost(<Probe />);
  await act(async () => { await editor.applyAllCaptions([clip], 3, captionPresets[3].style); });
  await act(async () => { vi.advanceTimersByTime(1300); });
  const args = vi.mocked(ipc.saveEditorRecovery).mock.calls[0];
  expect(args[4]?.[0]).toMatchObject({ clipId: id, expectedRevision: 1, baseDocument: other });
  vi.mocked(ipc.getEditorRecovery).mockResolvedValue({ baseRevision: 0, document: args[2] as Composition, related: args[4], updatedAtMs: 10 });
  await mounted.close(); mounted = undefined;
  mounted = await reactHost(<Probe />);
  await act(async () => editor.restore()); expect(editor.dirty).toBe(true);
  await act(async () => editor.undo()); expect(editor.dirty).toBe(false);
  expect(ipc.saveEditorBatch).not.toHaveBeenCalled();
});
it("ACK só dos outros cortes atualiza recuperação da edição ativa feita durante Save", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const active = { ...applyMontageCaptionStyle(compositionFromLegacy(legacy), 3, captionPresets[3].style), revision: 2 };
  vi.mocked(ipc.loadEditorProject).mockResolvedValue({ version: 1, project: { document: active, manuallyEdited: false, editedAtMs: 1 }, clips: { [id]: { document: other, manuallyEdited: true, editedAtMs: 1 } } });
  let finish!: (value: unknown) => void;
  vi.mocked(ipc.saveEditorBatch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  mounted = await reactHost(<Probe />);
  await act(async () => { await editor.applyAllCaptions([clip], 3, captionPresets[3].style); });
  let saving!: Promise<boolean>;
  await act(async () => { saving = editor.save(); });
  expect(vi.mocked(ipc.saveEditorBatch).mock.calls[0][5]).toBe(false);
  await act(async () => { editor.apply({ ...editor.document!, settings: { ...editor.document!.settings, text: "Edição durante Save" } }); });
  await act(async () => {
    const related = vi.mocked(ipc.saveEditorBatch).mock.calls[0][4][0];
    finish({ snapshot: null, related: { [id]: { document: { ...related.document, revision: 2 }, manuallyEdited: true, editedAtMs: 2 } } });
    expect(await saving).toBe(true);
  });
  await act(async () => { vi.advanceTimersByTime(1300); });
  const calls = vi.mocked(ipc.saveEditorRecovery).mock.calls;
  const recovery = calls[calls.length - 1];
  expect(recovery[2].settings.text).toBe("Edição durante Save");
  expect(recovery[3]).toBe(2);
  expect(recovery[4]).toBeUndefined();
});
