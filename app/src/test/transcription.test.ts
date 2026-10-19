import { afterEach, describe, expect, it, vi } from "vitest";
import { isTranscriptionJob, parseTranscript, parseEngineStatus, readTranscript, transcribeProject, saveTranscript } from "../lib/transcription";
import { emptyWorkspace } from "../lib/workspace";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

const record = { version: 1, mediaId: "m", language: "pt", model: "whisper-base",
  segments: [{ id: "s", start: 1.2, end: 2.45, text: "Olá, transcrição local!" }] };

describe("contratos de transcrição local", () => {
  it("valida diagnóstico antes de habilitar o motor", () => {
    expect(parseEngineStatus({ available: false, model: "base", error: "modelo ausente" }).available).toBe(false);
    expect(() => parseEngineStatus({ available: "true", model: "base", error: null })).toThrow();
    expect(() => parseEngineStatus(null)).toThrow();
  });
  it("preserva português e segundos reais", () => {
    expect(parseTranscript(record).segments[0]).toEqual(record.segments[0]);
    expect(parseTranscript({ ...record, segments: [] }).segments).toEqual([]);
  });
  it("recusa respostas incompletas e posições inválidas", () => {
    expect(() => parseTranscript({})).toThrow();
    for (const start of [-1, Infinity, NaN, 3]) {
      expect(() => parseTranscript({ ...record, segments: [{ ...record.segments[0], start }] })).toThrow();
    }
  });
  it("recusa eventos sem contrato e identifica job terminal", () => {
    expect(isTranscriptionJob({ jobId: "j", projectId: "p", state: "completed", stage: "saving", error: null, progress: 100 })).toBe(true);
    expect(isTranscriptionJob({ jobId: "j", projectId: "p", state: "ok", stage: "saving", error: null })).toBe(false);
    expect(isTranscriptionJob(null)).toBe(false);
    for (const progress of [-1, 101, "45", NaN, 40.5]) {
      expect(isTranscriptionJob({ jobId: "j", projectId: "p", state: "running", stage: "transcribing", error: null, progress })).toBe(false);
    }
  });
  it("mantém mídia e identificadores nos comandos IPC simulados", async () => {
    vi.mocked(invoke).mockResolvedValue(record);
    await expect(transcribeProject("p", "m", "j")).resolves.toEqual(record);
    expect(invoke).toHaveBeenCalledWith("transcribe_project", { projectId: "p", mediaId: "m", jobId: "j" });
    await saveTranscript("p", "m", record.segments);
    expect(invoke).toHaveBeenCalledWith("save_transcript", { projectId: "p", mediaId: "m", segments: record.segments });
    vi.mocked(invoke).mockResolvedValue(null);
    await expect(readTranscript("p", "m")).resolves.toBeNull();
  });
  it("não transforma falha IPC em transcrição de sucesso", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("modelo ausente"));
    await expect(transcribeProject("p", "m", "j")).rejects.toThrow("modelo ausente");
  });
  it("reabre cache com modo real sem apagar texto ou configurações", () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => entries.set(k, v) });
    const data = { ...emptyWorkspace(), transcriptMode: "real" as const, transcript: record.segments };
    data.settings.trimStart = 1;
    expect(saveWorkspace("p", data)).toBe(true);
    expect(readWorkspace("p")).toEqual(data);
  });
});
