import { afterEach, expect, it, vi } from "vitest";
import { openEmptyEditor } from "../services/direct-editor";
import * as ipc from "../lib/ipc";
import * as persistence from "../lib/composition-persistence";
import { emptyWorkspace } from "../lib/workspace";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { reactHost } from "./react-host";

vi.mock("../lib/ipc", () => ({ createProject: vi.fn(), openProject: vi.fn(), deleteProject: vi.fn(async () => undefined) }));
vi.mock("../lib/composition-persistence", () => ({ loadEditorState: vi.fn(), loadRecovery: vi.fn() }));
const project = { id: "f0834a57-0831-45bc-ac41-c5904fd39239", name: "Nova edição", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null };
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; vi.restoreAllMocks(); vi.clearAllMocks(); });
async function setup() {
  view = await reactHost(null);
  vi.mocked(ipc.createProject).mockResolvedValue({ ...project, id: "a54754ea-83c0-41e6-bebe-74b85e933797" });
  vi.mocked(ipc.openProject).mockResolvedValue(project);
  vi.mocked(persistence.loadEditorState).mockResolvedValue({ version: 1, project: null, clips: {} });
  vi.mocked(persistence.loadRecovery).mockResolvedValue(null);
  localStorage.setItem("cutnicepro.direct-editor.project", project.id);
  saveWorkspace(project.id, { ...emptyWorkspace(), editorOnly: true });
}

it("reutiliza só o projeto de entrada comprovadamente vazio, inclusive após recriar a sessão", async () => {
  await setup();
  expect((await openEmptyEditor([project])).id).toBe(project.id);
  expect(ipc.createProject).not.toHaveBeenCalled();
  expect(readWorkspace(project.id).editorOnly).toBe(true);
});

it.each(["assets", "recovery", "clips"] as const)("não reutiliza nem apaga projeto com %s", async kind => {
  await setup();
  const document = compositionFromLegacy(emptyWorkspace());
  const saved = { document, manuallyEdited: false, editedAtMs: 1 };
  if (kind === "assets") document.assets.push({ id: "image", mediaId: "a".repeat(64), name: "Foto.png", kind: "image", durationUs: 0, width: 10, height: 10, transcript: [] });
  vi.mocked(persistence.loadEditorState).mockResolvedValue({ version: 1, project: saved, clips: kind === "clips" ? { ["b".repeat(64)]: saved } : {} });
  if (kind === "recovery") vi.mocked(persistence.loadRecovery).mockResolvedValue({ baseRevision: 0, document, updatedAtMs: 1 });
  const result = await openEmptyEditor([project]);
  expect(result.id).not.toBe(project.id);
  expect(ipc.createProject).toHaveBeenCalledWith("Nova edição 2");
  expect(ipc.deleteProject).not.toHaveBeenCalled();
  expect(readWorkspace(result.id).editorOnly).toBe(true);
});

it("erro de leitura da montagem impede reuso silencioso e preserva o projeto", async () => {
  await setup(); vi.mocked(persistence.loadEditorState).mockRejectedValueOnce(new Error("Registro inválido"));
  await expect(openEmptyEditor([project])).rejects.toThrow("Registro inválido");
  expect(ipc.createProject).not.toHaveBeenCalled(); expect(ipc.deleteProject).not.toHaveBeenCalled();
});

it("falha de armazenamento reverte apenas o projeto recém-criado", async () => {
  await setup();
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Quota"); });
  await expect(openEmptyEditor([])).rejects.toThrow("Não foi possível salvar");
  expect(ipc.deleteProject).toHaveBeenCalledTimes(1);
  expect(ipc.deleteProject).toHaveBeenCalledWith("a54754ea-83c0-41e6-bebe-74b85e933797");
  expect(readWorkspace(project.id).editorOnly).toBe(true);
});

it("flag do editor sobrevive à recuperação de outro campo inválido do workspace", async () => {
  await setup();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  localStorage.setItem(`cnp.workspace.v1.${project.id}`, JSON.stringify({ ...emptyWorkspace(), editorOnly: true, transcript: [{ bad: true }] }));
  const recovered = readWorkspace(project.id);
  expect(recovered.editorOnly).toBe(true); expect(recovered.transcript).toEqual([]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("corrompido"));
});
