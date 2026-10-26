import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as transcription from "../lib/transcription";
import { beginPreparation, completePreparation, readPreparation, reconcilePreparations, setPreparationOutcome } from "../services/project-preparation-state";
import { removeWorkspace } from "../services/workspace-store";

vi.mock("../lib/transcription", async original => ({ ...await original<typeof import("../lib/transcription")>(), getTranscriptionJob: vi.fn() }));
let values: Map<string, string>;
const key = (id: string) => `cnp.preparation.v1.${id}`;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  vi.mocked(transcription.getTranscriptionJob).mockResolvedValue(null);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("reabrir sem job ativo marca interrupção durável e mantém mídia/projeto", async () => {
  beginPreparation("p", "media", "job");
  values.set("cnp.workspace.v1.p", "dados originais");
  await expect(reconcilePreparations(["p"])).resolves.toEqual({ interrupted: 1, failed: [] });
  expect(readPreparation("p")).toMatchObject({ state: "interrupted", mediaId: "media", jobId: "job" });
  expect(values.get("cnp.workspace.v1.p")).toBe("dados originais");
});

it("job nativo ainda vivo permanece running e não reinicia processamento", async () => {
  beginPreparation("p", "media", "job");
  vi.mocked(transcription.getTranscriptionJob).mockResolvedValue({ jobId: "job", projectId: "p", state: "running", stage: "transcribing", error: null, progress: 25 });
  await expect(reconcilePreparations(["p"])).resolves.toEqual({ interrupted: 0, failed: [] });
  expect(readPreparation("p")?.state).toBe("running");
  expect(transcription.getTranscriptionJob).toHaveBeenCalledTimes(1);
});

it("resultado tardio de outro job ou mídia não limpa uma tentativa nova", () => {
  beginPreparation("p", "new-media", "new-job");
  expect(completePreparation("p", "old-media", "new-job")).toBe(false);
  expect(completePreparation("p", "new-media", "old-job")).toBe(false);
  expect(readPreparation("p")?.jobId).toBe("new-job");
  expect(completePreparation("p", "new-media", "new-job")).toBe(true);
  expect(readPreparation("p")).toBeNull();
});

it("falha, cancelamento e nova tentativa são estados persistidos sem recriar projeto", () => {
  beginPreparation("p", "media", "job");
  setPreparationOutcome("p", "media", "job", "failed", "Motor indisponível");
  expect(readPreparation("p")?.state).toBe("failed");
  beginPreparation("p", "media", "retry");
  expect(readPreparation("p")).toMatchObject({ state: "running", jobId: "retry", message: null });
  setPreparationOutcome("p", "media", "retry", "cancelled", "Cancelada");
  expect(readPreparation("p")?.state).toBe("cancelled");
});

it("falha ao consultar job preserva estado e ausência de preparação evita IPC", async () => {
  await expect(reconcilePreparations(["p"])).resolves.toEqual({ interrupted: 0, failed: [] });
  expect(transcription.getTranscriptionJob).not.toHaveBeenCalled();
  beginPreparation("p", "media", "job");
  vi.mocked(transcription.getTranscriptionJob).mockRejectedValue(new Error("IPC indisponível"));
  const result = await reconcilePreparations(["p"]);
  expect(result.failed).toEqual(["p"]);
  expect(readPreparation("p")?.state).toBe("running");
});

it("metadado inválido fica preservado e excluir projeto limpa somente seu registro", () => {
  values.set(key("p"), "{inválido");
  expect(() => readPreparation("p")).toThrow(/preparação/i);
  expect(values.get(key("p"))).toBe("{inválido");
  beginPreparation("q", "other-media", "other-job");
  removeWorkspace("p");
  expect(values.has(key("p"))).toBe(false);
  expect(readPreparation("q")?.jobId).toBe("other-job");
});

it("snapshot nativo inválido não é evidência de job interrompido", async () => {
  beginPreparation("p", "media", "job");
  vi.mocked(transcription.getTranscriptionJob).mockResolvedValue({ state: "desconhecido" });
  await expect(reconcilePreparations(["p"])).resolves.toEqual({ interrupted: 0, failed: ["p"] });
  expect(readPreparation("p")?.state).toBe("running");
});
