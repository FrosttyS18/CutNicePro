import { afterEach, expect, it, vi } from "vitest";
import { importMedia } from "../lib/ipc";

type Progress = { payload: { jobId: string; bytesCopied: number; totalBytes: number } };
const native = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), off: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: native.listen }));
afterEach(() => vi.resetAllMocks());

it("cancelamento anterior não cria listener nem chama o serviço nativo", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(importMedia("p", "video.mp4", vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(native.listen).not.toHaveBeenCalled();
  expect(native.invoke).not.toHaveBeenCalled();
});

it("cancelamento durante registro do listener impede iniciar o nativo e libera o registro", async () => {
  const controller = new AbortController();
  native.listen.mockImplementation(async () => { controller.abort(); return native.off; });
  await expect(importMedia("p", "video.mp4", vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(native.invoke).not.toHaveBeenCalled();
  expect(native.off).toHaveBeenCalledOnce();
});

it("falha nativa libera listener e rejeita a tentativa", async () => {
  native.listen.mockResolvedValue(native.off);
  native.invoke.mockRejectedValue(new Error("Falha nativa"));
  await expect(importMedia("p", "video.mp4", vi.fn())).rejects.toThrow("Falha nativa");
  expect(native.off).toHaveBeenCalledOnce();
});

it("payload inválido não vira mídia importada e libera o listener", async () => {
  native.listen.mockResolvedValue(native.off);
  native.invoke.mockResolvedValue("{}");
  await expect(importMedia("p", "video.mp4", vi.fn())).rejects.toThrow("Resposta de importação inválida");
  expect(native.off).toHaveBeenCalledOnce();
});

it("escuta somente o progresso do job próprio e libera o listener no sucesso", async () => {
  let progress: ((event: Progress) => void) | undefined;
  native.listen.mockImplementation(async (_event, handler) => { progress = handler; return native.off; });
  native.invoke.mockImplementation(async (_command, args) => {
    progress?.({ payload: { jobId: "outro", bytesCopied: 90, totalBytes: 100 } });
    progress?.({ payload: { jobId: args.jobId, bytesCopied: 5, totalBytes: 10 } });
    return JSON.stringify({ mediaId: "media", sha256: "hash", sizeBytes: 10, ext: "mp4", originalName: "video.mp4", createdAtMs: 1, projectIds: ["p"], analysis: null, unavailable: false });
  });
  const onProgress = vi.fn();
  await importMedia("p", "video.mp4", onProgress);
  expect(onProgress).toHaveBeenCalledTimes(1);
  expect(onProgress).toHaveBeenCalledWith(5, 10);
  expect(native.invoke.mock.calls[0][1].jobId).toMatch(/^[0-9a-f-]{36}$/);
  expect(native.off).toHaveBeenCalledOnce();
});

it("cancela somente o job próprio, ignora progresso tardio e aguarda o nativo antes de rejeitar", async () => {
  let progress: ((event: Progress) => void) | undefined;
  let complete: ((value: string) => void) | undefined;
  const controller = new AbortController();
  native.listen.mockImplementation(async (_event, handler) => { progress = handler; return native.off; });
  native.invoke.mockImplementation((command) => command === "import_media" ? new Promise<string>((resolve) => { complete = resolve; }) : Promise.resolve(true));
  const onProgress = vi.fn();
  const importing = importMedia("p", "video.mp4", onProgress, controller.signal);
  await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith("import_media", expect.any(Object)));
  const jobId = native.invoke.mock.calls[0][1].jobId;
  controller.abort();
  progress?.({ payload: { jobId, bytesCopied: 10, totalBytes: 10 } });
  expect(native.invoke).toHaveBeenCalledWith("cancel_import", { jobId });
  expect(onProgress).not.toHaveBeenCalled();
  expect(native.off).not.toHaveBeenCalled();
  complete?.("{}");
  await expect(importing).rejects.toMatchObject({ name: "AbortError" });
  expect(native.off).toHaveBeenCalledOnce();
});
