import { act, useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionEditor } from "../components/editor/CompositionEditor";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition, CompositionAsset } from "../lib/composition-types";
import { reactHost } from "./react-host";

vi.mock("../lib/ipc", () => ({
  loadEditorProject: vi.fn(), getEditorRecovery: vi.fn(async () => null),
  discardEditorRecovery: vi.fn(async () => undefined), saveEditorRecovery: vi.fn(async () => undefined),
  getMedia: vi.fn(async () => null), saveEditorDocument: vi.fn(),
}));
vi.mock("../hooks/useTimelinePreview", () => ({ useTimelinePreview: () => ({ frames: [], peaks: [], error: null }) }));
vi.mock("../hooks/useCompositionMedia", () => ({
  useCompositionMedia: (assets: CompositionAsset[]) => Object.fromEntries(assets.map(asset => [asset.id, { url: `blob:${asset.mediaId}`, error: null }])),
}));
vi.mock("../components/editor/CompositionMediaPoster", () => ({ CompositionMediaPoster: () => null }));
vi.mock("../components/workspace/RelinkMediaControl", () => ({ RelinkMediaControl: () => null }));
vi.mock("../components/editor/CompositionStage", () => ({
  CompositionStage: ({ onReady }: { onReady: (value: boolean) => void }) => {
    useEffect(() => onReady(true), [onReady]);
    return null;
  },
}));

const ipc = await import("../lib/ipc");
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); });

async function mount() {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 640, height: 360, videoId: null, url: null };
  const initial = compositionFromLegacy(data, { hasAudio: false });
  vi.mocked(ipc.loadEditorProject).mockResolvedValue({ version: 1, project: { document: initial, manuallyEdited: false, editedAtMs: 1 }, clips: {} });
  vi.mocked(ipc.saveEditorDocument).mockImplementation(async (_project: string, _clip: string | null, document: Composition) =>
    ({ document: { ...document, revision: document.revision + 1 }, manuallyEdited: true, editedAtMs: 1 }));
  view = await reactHost(<CompositionEditor projectId="project" title="Projeto" data={data} localUrl="blob:source" onBack={vi.fn()}/>);
}

async function click(label: string, selector?: string) {
  const scope = selector ? view!.host.querySelector(selector)! : view!.host.ownerDocument;
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")]
    .find(value => value.getAttribute("aria-label") === label || value.textContent?.trim() === label);
  expect(button, label).toBeDefined();
  await act(async () => { button!.focus(); button!.click(); });
}

async function press(target: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  await act(async () => target.dispatchEvent(event));
  return event;
}

async function sourceTime(value: number) {
  const video = view!.host.querySelector<HTMLVideoElement>(".composition-source video")!;
  await act(async () => { video.currentTime = value; video.dispatchEvent(new window.Event("timeupdate")); });
  return video;
}

it.each(["Adicionar", "Adicionar no início", "Adicionar no fim"])("abrir a fonte por %s transfere o foco após fechar o menu", async label => {
  await mount();
  await click(label);
  await click("Escolher trecho da fonte");
  const source = view!.host.querySelector<HTMLElement>(".composition-source")!;
  expect(view!.host.ownerDocument.querySelector('[role="menu"]')).toBeNull();
  expect(view!.host.ownerDocument.activeElement).toBe(source);
  await sourceTime(2);
  await press(view!.host.ownerDocument.activeElement as HTMLElement, "i");
  await sourceTime(6);
  await press(view!.host.ownerDocument.activeElement as HTMLElement, "o");
  expect(source.querySelectorAll(".composition-source__marks output")[0].textContent).toBe("00:02");
  expect(source.querySelectorAll(".composition-source__marks output")[1].textContent).toBe("00:06");
  expect(view!.host.querySelector('[aria-label="Intervalo marcado"]')).toBeNull();
  expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
});

it.each(["Abrir fonte selecionada", "Adicionar no fim"])("reabrir por %s enquanto a fonte está visível devolve o foco à fonte", async label => {
  await mount();
  await click("Abrir fonte selecionada");
  await click(label);
  if (label === "Adicionar no fim") await click("Escolher trecho da fonte");
  expect(view!.host.ownerDocument.activeElement).toBe(view!.host.querySelector(".composition-source"));
  expect(view!.host.querySelector('.composition-source__controls [aria-label^="Adicionar"]')).not.toBeNull();
});

it("Espaço após abrir pelo menu reproduz a fonte e preserva a montagem pausada", async () => {
  await mount();
  await click("Adicionar");
  await click("Escolher trecho da fonte");
  const video = view!.host.querySelector<HTMLVideoElement>(".composition-source video")!;
  await press(view!.host.ownerDocument.activeElement as HTMLElement, " ");
  expect(video.paused).toBe(false);
  expect(view!.host.querySelector('[aria-label="Pausar fonte"]')).not.toBeNull();
  await click("Voltar à montagem");
  expect(view!.host.querySelector('[aria-label="Reproduzir montagem"]')).not.toBeNull();
  expect(view!.host.querySelector('[aria-label="Intervalo marcado"]')).toBeNull();
});

it("I/O, Espaço e Enter na faixa marcam, reproduzem e adicionam sem alterar a montagem antes de confirmar", async () => {
  await mount();
  await click("Abrir fonte selecionada");
  const slider = view!.host.querySelector<HTMLElement>('[aria-label="Posição na fonte"]')!;
  await act(async () => slider.focus());
  const video = await sourceTime(2);
  expect((await press(slider, "i")).defaultPrevented).toBe(true);
  await sourceTime(6);
  expect((await press(slider, "o")).defaultPrevented).toBe(true);
  expect((await press(slider, " ")).defaultPrevented).toBe(true);
  expect(video.paused).toBe(false);
  await press(slider, " ");
  expect(video.paused).toBe(true);
  expect(view!.host.querySelector('[aria-label="Intervalo marcado"]')).toBeNull();
  expect(view!.host.querySelector('[data-testid="editor-save-status"]')?.textContent).toBe("Versão salva");
  await press(slider, "Enter");
  await click("Salvar");
  const saved = vi.mocked(ipc.saveEditorDocument).mock.lastCall![2];
  expect(saved.items.filter((item: Composition["items"][number]) => item.kind === "video")).toContainEqual(expect.objectContaining({
    startFrame: 0, durationFrames: 120, sourceStartUs: 2_000_000, sourceEndUs: 6_000_000,
  }));
  expect(saved.items.find((item: Composition["items"][number]) => item.id === "source-0-video")?.startFrame).toBe(0);
  expect(view!.host.querySelector('[aria-label="Reproduzir montagem"]')).not.toBeNull();
});
