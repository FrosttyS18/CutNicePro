import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as ipc from "../lib/ipc";
import * as transcription from "../lib/transcription";
import { prepareProject } from "../services/prepare-project";
import { createPreparationTracker } from "../lib/project-preparation";
import { readWorkspace } from "../services/workspace-store";
import type { TranscriptionJob } from "../lib/transcription";
import { readPreparation } from "../services/project-preparation-state";

const events = vi.hoisted(() => ({ handler: undefined as ((event: { payload: unknown }) => void) | undefined, off: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
  events.handler = handler;
  return events.off;
}) }));
vi.mock("../lib/ipc", () => ({ createProject: vi.fn(), importMedia: vi.fn(), deleteProject: vi.fn(), getMedia: vi.fn(), mediaUrl: vi.fn(() => "http://cnplocal.localhost/video.mp4") }));
vi.mock("../lib/transcription", async (original) => ({ ...await original<typeof import("../lib/transcription")>(),
  getTranscriptionEngine: vi.fn(), transcribeProject: vi.fn(), cancelTranscription: vi.fn(), getTranscriptionJob: vi.fn() }));

const project = { id: "new", name: "Entrevista", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null };
const entry: ipc.MediaEntryDto = { mediaId: "media", sha256: "hash", sizeBytes: 20, ext: "mp4", originalName: "Entrevista.mp4", createdAtMs: 1,
  projectIds: ["new"], unavailable: false, analysis: { durationMs: 30000, width: 1920, height: 1080, fps: 30, videoCodec: "h264", audioCodec: "aac", hasAudio: true } };
const options = { tool: "editor" as const, model: 0, ratio: "16:9" as const };
const record: transcription.TranscriptRecord = { version: 1, mediaId: "media", language: "pt", model: "turbo", segments: [{ id: "s1", start: 0, end: 2, text: "Uma fala real." }] };

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.mocked(ipc.createProject).mockResolvedValue(project);
  vi.mocked(ipc.importMedia).mockResolvedValue({ entry, analysisError: null });
  vi.mocked(ipc.getMedia).mockResolvedValue(entry);
  vi.mocked(transcription.getTranscriptionEngine).mockResolvedValue({ available: true, model: "turbo", error: null });
  vi.mocked(transcription.transcribeProject).mockResolvedValue(record);
  vi.mocked(transcription.getTranscriptionJob).mockResolvedValue(null);
  vi.mocked(transcription.cancelTranscription).mockResolvedValue(true);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); events.handler = undefined; });

it("importa uma vez e persiste a transcrição antes de entregar o projeto", async () => {
  const updates = vi.fn();
  const result = await prepareProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn(), undefined, updates);
  expect(result.project).toEqual(project);
  expect(result.notice).toBeNull();
  expect(readWorkspace("new")).toMatchObject({ media: { mediaId: "media" }, transcriptMode: "real", transcript: record.segments });
  expect(ipc.importMedia).toHaveBeenCalledTimes(1);
  expect(transcription.transcribeProject).toHaveBeenCalledWith("new", "media", expect.any(String), "turbo", "auto");
  expect(updates.mock.calls.map(([value]) => value.stage)).toEqual(expect.arrayContaining(["validating", "extracting", "saving"]));
  expect(events.off).toHaveBeenCalledTimes(1);
  expect(readPreparation("new")).toBeNull();
});

it("falha de ASR mantém mídia e projeto para retry pela visão geral", async () => {
  vi.mocked(transcription.transcribeProject).mockRejectedValue(new Error("Whisper indisponível"));
  const result = await prepareProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn());
  expect(result.notice).toContain("transcri");
  expect(result.notice).toContain("editar");
  expect(readWorkspace("new").media?.mediaId).toBe("media");
  expect(ipc.deleteProject).not.toHaveBeenCalled();
  expect(ipc.importMedia).toHaveBeenCalledTimes(1);
  expect(events.off).toHaveBeenCalledTimes(1);
  expect(readPreparation("new")).toMatchObject({ state: "failed", mediaId: "media" });
});

it("sem áudio não inicia ASR e mantém o projeto editável", async () => {
  vi.mocked(ipc.getMedia).mockResolvedValue({ ...entry, analysis: { ...entry.analysis!, hasAudio: false } });
  const result = await prepareProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn());
  expect(result.notice).toContain("sem áudio");
  expect(transcription.transcribeProject).not.toHaveBeenCalled();
  expect(readWorkspace("new").media?.mediaId).toBe("media");
  expect(readPreparation("new")).toBeNull();
});

it("modelo indisponível entrega projeto preservado com recuperação existente", async () => {
  vi.mocked(transcription.getTranscriptionEngine).mockResolvedValue({ available: false, model: "turbo", error: "Modelo ausente" });
  const result = await prepareProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn());
  expect(result.notice).toContain("transcri");
  expect(result.notice).toContain("Verificar novamente");
  expect(transcription.transcribeProject).not.toHaveBeenCalled();
  expect(ipc.deleteProject).not.toHaveBeenCalled();
});

it("cancelar ASR cancela só o job próprio e não publica conclusão tardia", async () => {
  const controller = new AbortController();
  const updates = vi.fn();
  vi.mocked(transcription.transcribeProject).mockImplementation(async () => { controller.abort(); return record; });
  const result = await prepareProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn(), controller.signal, updates);
  expect(result.notice).toContain("cancelada");
  expect(transcription.cancelTranscription).toHaveBeenCalledWith(vi.mocked(transcription.transcribeProject).mock.calls[0][2]);
  expect(readWorkspace("new").transcript).toEqual([]);
  expect(ipc.deleteProject).not.toHaveBeenCalled();
  expect(events.off).toHaveBeenCalledTimes(1);
  expect(readPreparation("new")).toMatchObject({ state: "cancelled", mediaId: "media" });
});

it("filtra eventos de outros projetos e descarta listener ao terminar", async () => {
  const updates = vi.fn();
  vi.mocked(transcription.transcribeProject).mockImplementation(async (_projectId, _mediaId, jobId) => {
    const job: TranscriptionJob = { jobId, projectId: "other", state: "running", stage: "transcribing", progress: 90, error: null };
    events.handler?.({ payload: job });
    events.handler?.({ payload: { ...job, projectId: "new", progress: 25 } });
    return record;
  });
  await prepareProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn(), undefined, updates);
  const transcriptionUpdates = updates.mock.calls.map(([value]) => value).filter(value => value.stage === "transcribing");
  expect(transcriptionUpdates).toHaveLength(1);
  expect(transcriptionUpdates[0].percent).toBe(25);
  expect(events.off).toHaveBeenCalledTimes(1);
  const completedCount = updates.mock.calls.length;
  events.handler?.({ payload: { jobId: vi.mocked(transcription.transcribeProject).mock.calls[0][2], projectId: "new", state: "running", stage: "transcribing", progress: 90, error: null } });
  expect(updates.mock.calls).toHaveLength(completedCount);
});

it("nenhuma fala é um projeto editável e não uma falha de importação", async () => {
  vi.mocked(transcription.transcribeProject).mockResolvedValue({ ...record, segments: [] });
  const result = await prepareProject("C:\\Entrevista.mp4", "Entrevista", options, vi.fn());
  expect(result.notice).toContain("Nenhuma fala");
  expect(readWorkspace("new").transcriptMode).toBe("real");
  expect(readWorkspace("new").media?.mediaId).toBe("media");
  expect(ipc.deleteProject).not.toHaveBeenCalled();
});

it("estima somente uma etapa com avanço medido e reinicia a estimativa na próxima", () => {
  const tracker = createPreparationTracker();
  expect(tracker("importing", 0, 100, 0).remainingSeconds).toBeNull();
  expect(tracker("importing", 10, 100, 500).remainingSeconds).toBeNull();
  expect(tracker("importing", 50, 100, 5000).remainingSeconds).toBe(5);
  expect(tracker("extracting", undefined, undefined, 6000).remainingSeconds).toBeNull();
  expect(tracker("transcribing", 20, 100, 7000).remainingSeconds).toBeNull();
});
