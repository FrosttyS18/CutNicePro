import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorTranscriptionControls } from "../components/editor/EditorTranscriptionControls";
import * as api from "../lib/editor-transcription";
import { getTranscriptionEngine } from "../lib/transcription";
import type { TranscriptRecord } from "../lib/transcription";
import type { Composition } from "../lib/composition-types";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

const bus = vi.hoisted(() => ({ receive: null as ((event: { payload: unknown }) => void) | null }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (_name, receive) => { bus.receive = receive; return vi.fn(); }) }));
vi.mock("../lib/editor-transcription", async original => ({ ...await original<typeof import("../lib/editor-transcription")>(),
  getEditorTranscriptionJob: vi.fn(), readEditorTranscript: vi.fn(), transcribeEditorMedia: vi.fn(),
}));
vi.mock("../lib/transcription", async original => ({ ...await original<typeof import("../lib/transcription")>(), getTranscriptionEngine: vi.fn() }));
vi.mock("../components/editor/EditorAction", () => ({ EditorAction: ({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) =>
  <button type="button" aria-label={label} aria-disabled={disabled} onClick={onClick}>{label}</button> }));
vi.mock("../components/workspace/TranscriptionSetup", () => ({ TranscriptionSetup: ({ open, onStart }: { open: boolean; onStart: () => void }) => open ? <button type="button" onClick={onStart}>Iniciar transcrição</button> : null }));
vi.mock("../components/workspace/TranscriptionDialog", () => ({ TranscriptionDialog: () => null }));

const record = (text: string): TranscriptRecord => ({ version: 1, mediaId: "a", language: "pt", model: "turbo", segments: [{ id: "s", start: 0, end: 1, text }] });
const running = { jobId: "job-a", projectId: "p", mediaId: "a", state: "running" as const, stage: "transcribing" as const, progress: 20, error: null };
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
const change = vi.fn();
beforeEach(() => {
  vi.mocked(getTranscriptionEngine).mockResolvedValue({ available: true, model: "turbo", error: null, profiles: [{ id: "turbo", available: true }] });
  vi.mocked(api.getEditorTranscriptionJob).mockResolvedValue(null);
  vi.mocked(api.transcribeEditorMedia).mockResolvedValue(running);
});
afterEach(async () => { await view?.close(); view = undefined; bus.receive = null; vi.clearAllMocks(); });

it.each(["success", "failure"] as const)("não aplica resultado anterior durante releitura e após falha: %s", async outcome => {
  let resolve!: (value: TranscriptRecord) => void;
  let reject!: (error: Error) => void;
  vi.mocked(api.readEditorTranscript).mockResolvedValueOnce(record("R1 anterior")).mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
  const document = compositionFromLegacy(emptyWorkspace());
  document.assets = [{ id: "a", mediaId: "a", name: "Vídeo A", kind: "video", durationUs: 10_000_000, width: 640, height: 360, hasAudio: true, transcript: [] }];
  view = await reactHost(<EditorTranscriptionControls projectId="p" document={document} preferredAssetId="a" onChange={change} onPause={vi.fn()} onError={vi.fn()}/>);
  await view.click("Transcrever novamente");
  await view.click("Iniciar transcrição");
  await act(async () => { bus.receive?.({ payload: { ...running, state: "completed", progress: 100 } }); });
  const apply = () => view!.host.querySelector<HTMLButtonElement>('[aria-label="Aplicar transcrição"]')!;
  expect(apply().getAttribute("aria-disabled")).toBe("true");
  await view.click("Aplicar transcrição");
  expect(change).not.toHaveBeenCalled();
  await act(async () => {
    if (outcome === "success") resolve(record("R2 nova"));
    else reject(new Error("Não foi possível ler a nova transcrição."));
  });
  if (outcome === "success") {
    expect(apply().getAttribute("aria-disabled")).toBe("false");
    await view.click("Aplicar transcrição");
    expect((change.mock.calls[0][0] as Composition).assets[0].transcript[0].text).toBe("R2 nova");
  } else {
    expect(apply().getAttribute("aria-disabled")).toBe("true");
    await view.click("Aplicar transcrição");
    expect(change).not.toHaveBeenCalled();
    expect(view.host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  }
  expect(document.assets[0].transcript).toEqual([]);
});
