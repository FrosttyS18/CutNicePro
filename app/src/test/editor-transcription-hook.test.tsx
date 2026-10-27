import { act, useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEditorTranscription } from "../hooks/useEditorTranscription";
import * as api from "../lib/editor-transcription";
import { cancelTranscription, getTranscriptionEngine } from "../lib/transcription";
import type { EditorTranscriptionJob } from "../lib/editor-transcription";
import type { TranscriptRecord } from "../lib/transcription";
import { reactHost } from "./react-host";

const bus = vi.hoisted(() => ({ receive: null as ((event: { payload: unknown }) => void) | null, stop: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (_name, receive) => { bus.receive = receive; return bus.stop; }) }));
vi.mock("../lib/editor-transcription", async original => ({ ...await original<typeof import("../lib/editor-transcription")>(),
  getEditorTranscriptionJob: vi.fn(), readEditorTranscript: vi.fn(), transcribeEditorMedia: vi.fn(),
}));
vi.mock("../lib/transcription", async original => ({ ...await original<typeof import("../lib/transcription")>(), getTranscriptionEngine: vi.fn(), cancelTranscription: vi.fn() }));

let view: Awaited<ReturnType<typeof reactHost>> | undefined;
let controller: ReturnType<typeof useEditorTranscription>;
const record = (id: string, text = id): TranscriptRecord => ({ version: 1, mediaId: id, language: "pt", model: "turbo", segments: text ? [{ id: "s", start: 0, end: 1, text }] : [] });
const job = (id = "a", jobId = "job-a"): EditorTranscriptionJob => ({ jobId, projectId: "p", mediaId: id, state: "running", stage: "transcribing", progress: 20, error: null });
function Probe({ mediaId = "a", projectId = "p" }: { mediaId?: string; projectId?: string }) {
  const value = useEditorTranscription(projectId, mediaId);
  useLayoutEffect(() => { controller = value; });
  return null;
}
beforeEach(() => {
  vi.mocked(getTranscriptionEngine).mockResolvedValue({ available: true, model: "turbo", error: null, profiles: [{ id: "turbo", available: true }] });
  vi.mocked(api.getEditorTranscriptionJob).mockResolvedValue(null);
  vi.mocked(api.readEditorTranscript).mockImplementation(async (_projectId, mediaId) => record(mediaId));
  vi.mocked(api.transcribeEditorMedia).mockImplementation(async (_projectId, mediaId) => job(mediaId, `job-${mediaId}`));
  vi.mocked(cancelTranscription).mockResolvedValue(true);
});
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); bus.receive = null; });
async function mount() { view = await reactHost(<Probe/>); }
async function emit(value: unknown) { await act(async () => { bus.receive?.({ payload: value }); await Promise.resolve(); }); }

it("abrir e trocar a mídia só lê resultado existente, sem iniciar inferência", async () => {
  await mount();
  expect(controller.ready).toBe(true);
  expect(controller.record?.mediaId).toBe("a");
  await view!.render(<Probe mediaId="b"/>);
  expect(controller.record?.mediaId).toBe("b");
  expect(api.transcribeEditorMedia).not.toHaveBeenCalled();
});

it("mantém job A visível ao selecionar B e conclusão tardia só atualiza o cache de A", async () => {
  await mount();
  await act(async () => controller.start("turbo", "auto"));
  await view!.render(<Probe mediaId="b"/>);
  expect(controller.job?.mediaId).toBe("a");
  expect(controller.busy).toBe(true);
  await emit({ ...job(), state: "completed", progress: 100 });
  expect(controller.record?.mediaId).toBe("b");
  expect(controller.job?.mediaId).toBe("a");
  expect(controller.busy).toBe(false);
  await view!.render(<Probe mediaId="a"/>);
  expect(controller.record?.mediaId).toBe("a");
});

it("eventos de outro projeto ou sem identidade são ignorados", async () => {
  await mount();
  await emit({ ...job(), projectId: "other", state: "completed" });
  await emit({ jobId: "invalid", projectId: "p", state: "completed" });
  expect(controller.job).toBeNull();
});

it("reabre com job de outra mídia em execução e cancelar usa o jobId exato", async () => {
  vi.mocked(api.getEditorTranscriptionJob).mockResolvedValue(job("b", "restored"));
  await mount();
  expect(controller.job?.mediaId).toBe("b");
  await act(async () => { expect(await controller.cancel()).toBe(true); });
  expect(cancelTranscription).toHaveBeenCalledWith("restored");
  await emit({ ...job("b", "restored"), state: "cancelled" });
  expect(controller.busy).toBe(false);
  expect(controller.record?.mediaId).toBe("a");
});

it("resposta de start running não desfaz evento completed recebido antes", async () => {
  let finish!: (value: EditorTranscriptionJob) => void;
  vi.mocked(api.transcribeEditorMedia).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount();
  let pending!: Promise<void>;
  await act(async () => { pending = controller.start("turbo", "auto"); });
  await emit({ ...job(), state: "completed", progress: 100 });
  await act(async () => { finish(job()); await pending; });
  expect(controller.job?.state).toBe("completed");
  expect(controller.busy).toBe(false);
});

it("evento de um job concluído anterior não substitui o retry novo", async () => {
  await mount();
  await act(async () => controller.start("turbo", "auto"));
  await emit({ ...job(), state: "completed", progress: 100 });
  vi.mocked(api.transcribeEditorMedia).mockResolvedValue(job("a", "retry"));
  await act(async () => controller.start("turbo", "auto"));
  await emit({ ...job("a", "retry"), state: "completed", progress: 100 });
  await emit({ ...job(), state: "completed", progress: 100 });
  expect(controller.job?.jobId).toBe("retry");
});

it("texto vazio é um resultado válido e falha de retry preserva o resultado anterior", async () => {
  vi.mocked(api.readEditorTranscript).mockResolvedValue(record("a", ""));
  await mount();
  expect(controller.record?.segments).toEqual([]);
  vi.mocked(api.transcribeEditorMedia).mockRejectedValue(new Error("motor indisponível"));
  await act(async () => controller.start("turbo", "auto"));
  expect(controller.record?.segments).toEqual([]);
  expect(controller.error).toBeTruthy();
  expect(controller.busy).toBe(false);
});

it.each(["success", "failure"] as const)("releitura após conclusão mantém o cache sem permitir uso até resultado válido: %s", async outcome => {
  await mount();
  let resolve!: (value: TranscriptRecord) => void;
  let reject!: (error: Error) => void;
  vi.mocked(api.readEditorTranscript).mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
  await act(async () => controller.start("turbo", "auto"));
  await emit({ ...job(), state: "completed", progress: 100 });
  expect(controller.busy).toBe(false);
  expect(controller.recordLoading).toBe(true);
  expect(controller.record?.segments[0].text).toBe("a");
  expect(controller.recordReady).toBe(false);
  await act(async () => {
    if (outcome === "success") resolve(record("a", "Nova transcrição"));
    else reject(new Error("Não foi possível ler a nova transcrição."));
  });
  expect(controller.recordLoading).toBe(false);
  expect(controller.recordReady).toBe(outcome === "success");
  expect(controller.record?.segments[0].text).toBe(outcome === "success" ? "Nova transcrição" : "a");
  if (outcome === "failure") expect(controller.error).toBeTruthy();
});

it("trocar projeto e desmontar descarta mensagens/respostas tardias e remove listener", async () => {
  let finish!: (value: EditorTranscriptionJob) => void;
  vi.mocked(api.transcribeEditorMedia).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount();
  let pending!: Promise<void>;
  await act(async () => { pending = controller.start("turbo", "auto"); });
  await view!.render(<Probe mediaId="b" projectId="other"/>);
  await act(async () => { finish(job()); await pending; });
  expect(controller.job).toBeNull();
  expect(controller.record?.mediaId).toBe("b");
  const count = vi.mocked(api.readEditorTranscript).mock.calls.length;
  const receive = bus.receive;
  await view!.close(); view = undefined;
  receive?.({ payload: { ...job("b"), projectId: "other", state: "completed" } });
  expect(api.readEditorTranscript).toHaveBeenCalledTimes(count);
  expect(bus.stop).toHaveBeenCalledTimes(2);
});
