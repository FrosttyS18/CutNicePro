import { act, useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionEditor } from "../components/editor/CompositionEditor";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
import type { CompositionSourceRequest } from "../lib/composition-insertion-target";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => "C:/fixtures/added.mp4") }));
vi.mock("../lib/ipc", () => ({
  loadEditorProject: vi.fn(), getEditorRecovery: vi.fn(async () => null), discardEditorRecovery: vi.fn(async () => undefined), saveEditorRecovery: vi.fn(async () => undefined),
  getMedia: vi.fn(async () => null),
  importMedia: vi.fn(), saveEditorDocument: vi.fn(async (_project: string, _clip: string | null, document: Composition) => ({ document: { ...document, revision: 1 }, manuallyEdited: true, editedAtMs: 1 })),
}));
let current: Composition;
vi.mock("../components/editor/CompositionEditorBody", () => ({ CompositionEditorBody: ({ document, frame, onReady, onSeek, sourceRequest }: {
  document: Composition; frame: number; onReady: (ready: boolean) => void; onSeek: (frame: number) => void; sourceRequest?: CompositionSourceRequest;
}) => {
  current = document;
  useEffect(() => onReady(true), [onReady]);
  return <div><button type="button" onClick={() => onSeek(150)}>Posicionar cursor</button><output data-current-frame>{frame}</output><output data-source-target>{sourceRequest?.target}</output></div>;
} }));
const ipc = await import("../lib/ipc");
const dialog = await import("@tauri-apps/plugin-dialog");
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); });
const entry = { mediaId: "added", sha256: "b".repeat(64), ext: "mp4", originalName: "Adicionado.mp4", sizeBytes: 100, createdAtMs: 1, projectIds: ["project"], unavailable: false,
  analysis: { durationMs: 2000, width: 640, height: 360, hasAudio: false, fps: 30, videoCodec: "h264", audioCodec: null } };

async function mount(empty = false, locked = false) {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  let document = compositionFromLegacy(data);
  document.assets[0].hasAudio = false;
  document.items = document.items.filter(item => item.kind === "video");
  document.tracks.find(track => track.primary)!.locked = locked;
  if (empty) document.items = [];
  const audio = { ...document.assets[0], id: "audio", mediaId: "audio", kind: "audio" as const, durationUs: 30000000, hasAudio: true };
  document = { ...document, assets: [...document.assets, audio], items: [...document.items, { id: "audio", trackId: "A1", assetId: "audio", kind: "audio", startFrame: 0, durationFrames: 900,
    sourceStartUs: 0, sourceEndUs: 30000000, groupId: "audio", followsMain: false, settings: document.settings, captionEdits: {} }] };
  vi.mocked(ipc.loadEditorProject).mockResolvedValue({ version: 1, project: { document, manuallyEdited: false, editedAtMs: 1 }, clips: {} });
  vi.mocked(ipc.importMedia).mockResolvedValue({ entry, analysisError: null });
  view = await reactHost(<CompositionEditor projectId="project" title="Projeto" data={data} localUrl="source.mp4" onBack={vi.fn()}/>);
  await view.click("Posicionar cursor");
  return document;
}
async function click(label: string) {
  const button = Array.from(view!.host.ownerDocument.querySelectorAll<HTMLButtonElement>("button")).find(value => value.getAttribute("aria-label") === label || value.textContent?.trim() === label);
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
function position() { return view!.host.querySelector("[data-current-frame]")?.textContent; }

it.each([["início", 0], ["fim", 300]] as const)("adiciona no %s da principal sem usar a cauda de áudio ou mover o cursor", async (where, expected) => {
  const before = await mount();
  await click(`Adicionar no ${where}`); await click("Vídeo na faixa principal");
  expect(current.items.find(item => item.assetId === "added")?.startFrame).toBe(expected);
  expect(current.items.find(item => item.id === "audio")).toEqual(before.items.find(item => item.id === "audio"));
  expect(position()).toBe("150");
  expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await click("Desfazer (Ctrl+Z)"); expect(current.items).toEqual(before.items);
  await click("Refazer (Ctrl+Shift+Z)"); expect(current.items.find(item => item.assetId === "added")?.startFrame).toBe(expected);
  await click("Salvar"); expect(ipc.saveEditorDocument).toHaveBeenCalledTimes(1);
});

it("fim de principal vazia é zero mesmo com áudio longo", async () => {
  await mount(true); await click("Adicionar no fim"); await click("Vídeo na faixa principal");
  expect(current.items.find(item => item.assetId === "added")?.startFrame).toBe(0);
  expect(position()).toBe("150");
});

it("cancelar o seletor não altera documento nem contamina a adição seguinte no cursor", async () => {
  const before = await mount();
  vi.mocked(dialog.open).mockResolvedValueOnce(null);
  await click("Adicionar no início"); await click("Vídeo na faixa principal");
  expect(current.items).toEqual(before.items); expect(position()).toBe("150");
  expect(ipc.importMedia).not.toHaveBeenCalled();
  await click("Adicionar"); await click("Vídeo na faixa principal");
  expect(current.items.find(item => item.assetId === "added")?.startFrame).toBe(150);
});

it("bloqueio da principal desabilita as extremidades e não abre seletor", async () => {
  await mount(false, true);
  const before = vi.mocked(dialog.open).mock.calls.length;
  for (const label of ["Adicionar no início", "Adicionar no fim"]) {
    expect(view!.host.querySelector(`[aria-label="${label}"]`)?.getAttribute("aria-disabled")).toBe("true");
    await click(label);
  }
  expect(view!.host.ownerDocument.querySelector('[role="menu"]')).toBeNull();
  expect(dialog.open).toHaveBeenCalledTimes(before);
});

it("menu de extremidade fecha com Escape e mantém cursor e ferramenta de intervalo", async () => {
  await mount(); await click("Marcar intervalo (R)");
  const button = view!.host.querySelector<HTMLButtonElement>('[aria-label="Adicionar no fim"]');
  expect(button).not.toBeNull();
  await act(async () => {
    button!.focus(); button!.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true, clientX: 500 })); button!.click();
  });
  const menu = view!.host.ownerDocument.querySelector('[role="menu"]')!;
  await act(async () => menu.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(view!.host.ownerDocument.querySelector('[role="menu"]')).toBeNull();
  expect(view!.host.ownerDocument.activeElement).toBe(button);
  expect(position()).toBe("150");
  expect(view!.host.querySelector('[aria-label="Intervalo marcado"]')).toBeNull();
});
