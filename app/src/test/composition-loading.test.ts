import { beforeEach, describe, expect, it, vi } from "vitest";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { loadEditorState, compositionPersistence, loadRecovery } from "../lib/composition-persistence";

vi.mock("../lib/ipc", () => ({ loadEditorProject: vi.fn(), saveEditorDocument: vi.fn(), getEditorRecovery: vi.fn() }));
const ipc = await import("../lib/ipc");
const target = { projectId: "project", clipId: "a".repeat(64) };
const document = compositionFromLegacy(emptyWorkspace());
const saved = { document: { ...document, revision: 1 }, manuallyEdited: true, editedAtMs: 10 };
beforeEach(() => vi.clearAllMocks());

describe("adaptação IPC do documento de edição", () => {
  it("lê projeto e corte como destinos independentes", async () => {
    vi.mocked(ipc.loadEditorProject).mockResolvedValue({ version: 1, project: null, clips: { [target.clipId]: saved } });
    const state = await loadEditorState(target.projectId);
    expect(state.project).toBeNull();
    expect(state.clips[target.clipId].document.revision).toBe(1);
  });
  it("rejeita gravação de clipe que não confirmou a origem manual", async () => {
    vi.mocked(ipc.saveEditorDocument).mockResolvedValue({ ...saved, manuallyEdited: false });
    await expect(compositionPersistence(target).save(document, 0)).rejects.toThrow(/edição manual/);
  });
  it("recuperação é independente da versão salva", async () => {
    vi.mocked(ipc.getEditorRecovery).mockResolvedValue({ baseRevision: 0, document, updatedAtMs: 20 });
    expect((await loadRecovery(target))?.baseRevision).toBe(0);
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });
  it("documento salvo inválido produz erro legível", async () => {
    vi.mocked(ipc.loadEditorProject).mockResolvedValue({ version: 1, project: { ...saved, document: {} }, clips: {} });
    await expect(loadEditorState(target.projectId)).rejects.toThrow(/montagem/);
  });
});
