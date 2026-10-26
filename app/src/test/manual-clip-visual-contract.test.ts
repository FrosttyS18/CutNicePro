import { beforeEach, expect, it, vi } from "vitest";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { compositionPersistence, createManualClip } from "../lib/composition-persistence";
import type { Composition } from "../lib/composition-types";
import { emptyWorkspace } from "../lib/workspace";
import * as ipc from "../lib/ipc";

vi.mock("../lib/ipc", () => ({ createEditorClip: vi.fn(), saveEditorDocument: vi.fn() }));

const message = "Selecione um intervalo com vídeo ou imagem para criar o clipe.";
const id = "a".repeat(64);

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", name: "Fonte", mediaId: "source", width: 160, height: 90, duration: 1, videoId: null, url: null };
  workspace.transcript = [{ id: "s", start: 0, end: 1, text: "Legenda" }];
  return compositionFromLegacy(workspace);
}

function receipt(document: Composition) {
  return { document: { ...structuredClone(document), revision: 1 }, manuallyEdited: false,
    editedAtMs: 1, origin: "manual", title: "Clipe", createdAtMs: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ipc.createEditorClip).mockImplementation(async (_project, _title, document) => ({ id, snapshot: receipt(document) }));
});

it.each(["empty", "audio", "caption", "audio-caption"])("não publica clipe novo sem visual: %s", async kind => {
  const document = fixture();
  document.items = document.items.filter(item => kind.includes(item.kind));
  const before = JSON.stringify(document);
  await expect(createManualClip("project", "Clipe", document)).rejects.toThrow(message);
  expect(ipc.createEditorClip).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
});

it.each(["video", "image", "hidden-video"])("aceita conteúdo visual estrutural sem inferir pixels: %s", async kind => {
  const document = fixture();
  document.items = document.items.filter(item => item.kind === "video");
  if (kind === "image") {
    document.items[0].kind = "image";
    document.assets[0].kind = "image";
  }
  if (kind === "hidden-video") document.tracks[0].hidden = true;
  const before = JSON.stringify(document);
  const created = await createManualClip("project", "Clipe", document);
  expect(created.id).toBe(id);
  expect(created.snapshot.document.items).toEqual(document.items);
  expect(ipc.createEditorClip).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(document)).toBe(before);
});

it("rejeita item visual sem mídia compatível antes do IPC", async () => {
  const document = fixture();
  document.items[0].assetId = "missing";
  await expect(createManualClip("project", "Clipe", document)).rejects.toThrow(/mídia/);
  expect(ipc.createEditorClip).not.toHaveBeenCalled();
});

it("continua salvando edição existente vazia", async () => {
  const document = compositionFromLegacy(emptyWorkspace());
  vi.mocked(ipc.saveEditorDocument).mockResolvedValue({ ...receipt(document), manuallyEdited: true });
  const saved = await compositionPersistence({ projectId: "project", clipId: id }).save(document, 0);
  expect(saved.items).toEqual([]);
  expect(ipc.saveEditorDocument).toHaveBeenCalledTimes(1);
});
