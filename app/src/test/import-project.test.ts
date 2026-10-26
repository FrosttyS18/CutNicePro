import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as ipc from "../lib/ipc";
import { importProject } from "../services/import-project";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { emptyWorkspace } from "../lib/workspace";
import { defaultSplitScreen } from "../lib/split-screen";

vi.mock("../lib/ipc", () => ({ createProject: vi.fn(), importMedia: vi.fn(), deleteProject: vi.fn(), suggestSplitScreen: vi.fn(), mediaUrl: vi.fn(() => "http://cnplocal.localhost/video.mp4") }));

const project = { id: "new", name: "Entrevista", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null };
const entry: ipc.MediaEntryDto = { mediaId: "media", sha256: "hash", sizeBytes: 20, ext: "mp4", originalName: "Entrevista.mp4", createdAtMs: 1,
  projectIds: ["old", "new"], unavailable: false, analysis: { durationMs: 30000, width: 1920, height: 1080, fps: 30, videoCodec: "h264", audioCodec: null, hasAudio: false } };
const options = { tool: "captions" as const, model: 3, ratio: "9:16" as const, fit: "cover" as const };

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.mocked(ipc.createProject).mockResolvedValue(project);
  vi.mocked(ipc.importMedia).mockResolvedValue({ entry, analysisError: null });
  vi.mocked(ipc.deleteProject).mockResolvedValue(undefined);
  vi.mocked(ipc.suggestSplitScreen).mockResolvedValue({ status: "found", layout: defaultSplitScreen(), message: "Duas regiões confirmadas." });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("salva objetivo, preenchimento, proporção e legenda com a mídia real", async () => {
  await expect(importProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn())).resolves.toEqual(project);
  expect(readWorkspace("new")).toMatchObject({ tool: "captions", media: { mediaId: "media", duration: 30 },
    settings: { fit: "cover", ratio: "9:16", captionModel: 3 } });
  expect(ipc.deleteProject).not.toHaveBeenCalled();
});

it("persiste a composição escolhida no envio e recusa uma combinação inválida", async () => {
  const splitScreen = defaultSplitScreen();
  await importProject("C:\\Entrevista.mp4", "Entrevista", { ...options, splitScreen }, vi.fn());
  expect(readWorkspace("new").settings.splitScreen).toEqual({ ...splitScreen, faceValidated: true });
  vi.mocked(ipc.createProject).mockClear();
  await expect(importProject("C:\\Entrevista.mp4", "Entrevista", { ...options, ratio: "16:9", splitScreen }, vi.fn())).rejects.toThrow("composição");
  expect(ipc.createProject).not.toHaveBeenCalled();
});

it("importa sem duplicar a imagem e informa quando não há duas pessoas separáveis", async () => {
  vi.mocked(ipc.suggestSplitScreen).mockResolvedValue({ status: "manual", message: "Não há duas pessoas neste quadro." });
  const result = await importProject("C:\\Entrevista.mp4", "Entrevista", { ...options, splitScreen: defaultSplitScreen() }, vi.fn());
  expect(result.importNotice).toContain("duas pessoas");
  expect(readWorkspace("new").settings.splitScreen).toBeNull();
  expect(ipc.deleteProject).not.toHaveBeenCalled();
});

it("falha remove somente o projeto recém-criado e preserva dados anteriores", async () => {
  const old = emptyWorkspace(); old.settings.text = "Edição anterior";
  saveWorkspace("old", old);
  vi.mocked(ipc.importMedia).mockRejectedValue(new Error("Falha na cópia"));
  await expect(importProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn())).rejects.toThrow("Falha na cópia");
  expect(ipc.deleteProject).toHaveBeenCalledTimes(1);
  expect(ipc.deleteProject).toHaveBeenCalledWith("new");
  expect(readWorkspace("old").settings.text).toBe("Edição anterior");
  expect(readWorkspace("new").media).toBeNull();
});

it("cancelamento tardio não publica sucesso e desfaz apenas a tentativa nova", async () => {
  const controller = new AbortController();
  vi.mocked(ipc.importMedia).mockImplementation(async () => { controller.abort(); return { entry, analysisError: null }; });
  await expect(importProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(ipc.deleteProject).toHaveBeenCalledTimes(1);
  expect(ipc.deleteProject).toHaveBeenCalledWith("new");
  expect(readWorkspace("new").media).toBeNull();
});

it("cancelamento anterior não cria projeto e mídia sem análise não vira sucesso", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(importProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(ipc.createProject).not.toHaveBeenCalled();
  vi.mocked(ipc.importMedia).mockResolvedValue({ entry: { ...entry, analysis: null }, analysisError: "Arquivo inválido" });
  await expect(importProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn())).rejects.toThrow("Arquivo inválido");
  expect(ipc.deleteProject).toHaveBeenCalledTimes(1);
  expect(ipc.deleteProject).toHaveBeenCalledWith("new");
});

it("expõe falha de rollback sem declarar que o projeto foi removido", async () => {
  vi.mocked(ipc.importMedia).mockRejectedValue(new Error("Falha na cópia"));
  vi.mocked(ipc.deleteProject).mockRejectedValue(new Error("Pasta ocupada"));
  await expect(importProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn())).rejects.toThrow("Pasta ocupada");
});

it("cancelamento durante criação não inicia cópia e remove só o projeto retornado", async () => {
  const controller = new AbortController();
  vi.mocked(ipc.createProject).mockImplementation(async () => { controller.abort(); return project; });
  await expect(importProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(ipc.importMedia).not.toHaveBeenCalled();
  expect(ipc.deleteProject).toHaveBeenCalledWith("new");
});

it("falha ao salvar opções não abre sucesso e desfaz o novo projeto", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("Sem espaço"); }, removeItem: vi.fn() });
  await expect(importProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn())).rejects.toThrow("Não foi possível salvar");
  expect(ipc.deleteProject).toHaveBeenCalledWith("new");
});

it("preserva nome editado com pontos e opções antigas sem fit", async () => {
  await importProject("C:\\Entrevista.mp4", "Projeto 1.2", { tool: "editor", ratio: "16:9", model: 0 }, vi.fn());
  expect(ipc.createProject).toHaveBeenCalledWith("Projeto 1.2");
  expect(readWorkspace("new").settings.fit).toBe("contain");
});
