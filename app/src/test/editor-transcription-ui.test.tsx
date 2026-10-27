import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorTranscriptionControls } from "../components/editor/EditorTranscriptionControls";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
import type { TranscriptRecord } from "../lib/transcription";
import { reactHost } from "./react-host";

const state = vi.hoisted(() => ({
  ready: true, loaded: true, busy: false, profiles: [{ id: "turbo", available: true }],
  record: null as TranscriptRecord | null, recordLoading: false, recordReady: true, job: null, error: null,
  start: vi.fn(), cancel: vi.fn(), retry: vi.fn(),
}));
vi.mock("../hooks/useEditorTranscription", () => ({ useEditorTranscription: () => state }));
const transcript: TranscriptRecord = { version: 1, mediaId: "a", language: "pt", model: "turbo", segments: [{ id: "s", start: 0, end: 1, text: "Uma fala completa" }] };
const change = vi.fn(), error = vi.fn();
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
function document() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "a", name: "Vídeo A.mp4", duration: 10, width: 640, height: 360, videoId: null, url: null };
  return compositionFromLegacy(workspace);
}
async function mount(current = document(), preferredAssetId = "a") {
  view = await reactHost(<EditorTranscriptionControls projectId="p" document={current} preferredAssetId={preferredAssetId} onChange={change} onPause={vi.fn()} onError={error}/>);
}
beforeEach(() => { state.record = null; state.start.mockResolvedValue(undefined); });
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); });

it("editor vazio, imagens e vídeo sem áudio explicam o estado sem iniciar ASR", async () => {
  await mount(compositionFromLegacy(emptyWorkspace()));
  expect(view!.host.textContent).toContain("Importe um vídeo ou áudio");
  expect(view!.host.querySelector('[aria-label="Transcrever"]')).toBeNull();
  const image = document(); image.assets[0] = { ...image.assets[0], kind: "image", durationUs: 0 };
  image.items = [];
  await view!.render(<EditorTranscriptionControls projectId="p" document={image} onChange={change} onPause={vi.fn()} onError={error}/>);
  expect(view!.host.textContent).toContain("Imagens não têm fala");
  const silent = document(); silent.assets[0].hasAudio = false;
  await view!.render(<EditorTranscriptionControls projectId="p" document={silent} onChange={change} onPause={vi.fn()} onError={error}/>);
  expect(view!.host.textContent).toContain("Esta mídia não tem áudio");
  expect(state.start).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
});

it("Transcrever abre opções existentes e só confirma inferência ao clicar na ação do diálogo", async () => {
  await mount();
  expect(view!.host.textContent).toContain("Vídeo A.mp4");
  expect(state.start).not.toHaveBeenCalled();
  await view!.click("Transcrever");
  expect(state.start).not.toHaveBeenCalled();
  const dialog = view!.host.querySelector<HTMLDialogElement>('dialog[open]')!;
  const action = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Transcrever")!;
  await act(async () => action.click());
  expect(state.start).toHaveBeenCalledWith("turbo", "auto");
  expect(change).not.toHaveBeenCalled();
});

it("resultado só entra no rascunho com Aplicar, incluindo mídia ainda na biblioteca", async () => {
  state.record = transcript;
  const current = document(); current.items = [];
  await mount(current);
  expect(change).not.toHaveBeenCalled();
  await view!.click("Aplicar transcrição");
  expect(change).toHaveBeenCalledTimes(1);
  expect((change.mock.calls[0][0] as Composition).assets[0].transcript).toEqual(transcript.segments);
  expect(view!.host.textContent).toContain("Salve para confirmar");
});

it("resultado de outra mídia e ausência de fala não oferecem aplicação indevida", async () => {
  state.record = transcript;
  const current = document(); current.assets[0] = { ...current.assets[0], id: "b", mediaId: "b", name: "Vídeo B.mp4" };
  current.items = [];
  await mount(current, "b");
  expect(view!.host.querySelector('[aria-label="Aplicar transcrição"]')).toBeNull();
  state.record = { ...transcript, mediaId: "b", segments: [] };
  await view!.render(<EditorTranscriptionControls projectId="p" document={current} preferredAssetId="b" onChange={change} onPause={vi.fn()} onError={error}/>);
  expect(view!.host.textContent).toContain("Nenhuma fala encontrada");
  expect(view!.host.querySelector('[aria-label="Aplicar transcrição"]')).toBeNull();
  expect(change).not.toHaveBeenCalled(); expect(state.start).not.toHaveBeenCalled();
});

it("aplicação bloqueada preserva o documento e informa o erro", async () => {
  state.record = transcript;
  const current = document(); current.tracks.find(track => track.kind === "caption")!.locked = true;
  await mount(current);
  await view!.click("Aplicar transcrição");
  expect(change).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith(expect.stringContaining("bloqueada"));
  expect(current.assets[0].transcript).toEqual([]);
});
