import { act, useEffect, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionEditor } from "../components/editor/CompositionEditor";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { splitSelection } from "../lib/composition-edit";
import { sliceItem } from "../lib/composition-operations";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
import { reactHost } from "./react-host";

vi.mock("../lib/ipc", () => ({
  loadEditorProject: vi.fn(async () => ({ version: 1, project: null, clips: {} })),
  getEditorRecovery: vi.fn(async () => null), saveEditorRecovery: vi.fn(async () => undefined), discardEditorRecovery: vi.fn(async () => undefined),
  getMedia: vi.fn(async () => ({ mediaId: "source", sha256: "a".repeat(64), ext: "mp4", originalName: "Fonte.mp4", sizeBytes: 100,
    createdAtMs: 1, projectIds: ["project"], unavailable: false, analysis: { durationMs: 20000, width: 1920, height: 1080, fps: 30, hasAudio: true, videoCodec: "h264", audioCodec: "aac" } })),
  saveEditorDocument: vi.fn(async (_project: string, _clip: string | null, document: Composition, revision: number) => ({ document: { ...document, revision: revision + 1 }, manuallyEdited: true, editedAtMs: 10 })),
}));
vi.mock("../components/editor/CompositionEditorBody", () => ({
  CompositionEditorBody: ({ onReady, transport }: { onReady: (ready: boolean) => void; transport: ReactNode }) => {
    useEffect(() => onReady(true), [onReady]);
    return <div>{transport}</div>;
  },
}));
const ipc = await import("../lib/ipc");
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
let now = 0, sequence = 0;
const requests = new Map<number, FrameRequestCallback>();
afterEach(async () => { await view?.close(); view = undefined; requests.clear(); now = 0; vi.clearAllMocks(); vi.unstubAllGlobals(); });

function fixture(split = false) {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 20, width: 1920, height: 1080, videoId: null, url: null };
  data.settings.trimStart = 2; data.settings.trimEnd = 12;
  let document = compositionFromLegacy(data);
  if (split) document = splitSelection(document, [document.items[0].id], 150);
  document.tracks.push({ ...document.tracks[0], id: "V2", name: "Outra camada", primary: false });
  document.items.push({ ...sliceItem(document.items[0], 0, 100, document.fps, 500, "target", "target"), trackId: "V2", followsMain: false });
  return { data, document };
}
async function click(label: string) {
  const button = view!.host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  expect(button, label).not.toBeNull(); await act(async () => button.click());
}
async function mount(split = false, lockedTarget = false) {
  const { data, document } = fixture(split);
  document.tracks.find(track => track.id === "V2")!.locked = lockedTarget;
  const before = JSON.stringify(document);
  vi.mocked(ipc.loadEditorProject).mockResolvedValueOnce({ version: 1, project: { document, manuallyEdited: false, editedAtMs: 1 }, clips: {} });
  vi.stubGlobal("performance", { now: () => now });
  view = await reactHost(<CompositionEditor projectId="project" title="Projeto" data={data} localUrl="source.mp4" onBack={vi.fn()}/>, environment => {
    Object.defineProperty(environment, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => { const id = ++sequence; requests.set(id, callback); return id; } });
    Object.defineProperty(environment, "cancelAnimationFrame", { configurable: true, value: (id: number) => requests.delete(id) });
  });
  const rect = (top: number, bottom: number) => ({ left: 0, right: 840, top, bottom, width: 840, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
  const viewport = view.host.querySelector<HTMLElement>(".composition-timeline__viewport")!;
  Object.defineProperties(viewport, { clientWidth: { configurable: true, value: 840 }, clientHeight: { configurable: true, value: 300 },
    scrollWidth: { configurable: true, value: 2400 }, getBoundingClientRect: { configurable: true, value: () => rect(0, 300) } });
  view.host.querySelector<HTMLElement>('[data-composition-track="V1"]')!.getBoundingClientRect = () => rect(100, 160);
  view.host.querySelector<HTMLElement>('[data-composition-track="V2"]')!.getBoundingClientRect = () => rect(200, 260);
  view.host.querySelector<HTMLElement>("[data-drop-new-track]")!.getBoundingClientRect = () => rect(40, 64);
  await act(async () => window.dispatchEvent(new window.Event("resize")));
  await click("Posição precisa");
  const field = view.host.querySelector<HTMLInputElement>('[aria-label="Cursor da montagem em frames"]')!;
  await act(async () => { field.value = "75"; field.dispatchEvent(new window.Event("input", { bubbles: true })); });
  return { document, before };
}
function item(id = "source-0-video") { return view!.host.querySelector<HTMLElement>(`[data-composition-item="${id}"]`)!; }
function time() { return view!.host.querySelector(".composition-timeline__time")?.textContent; }
async function begin(id = "source-0-video", ctrlKey = false) {
  await act(async () => item(id).dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 300, clientY: 130, ctrlKey, bubbles: true })));
}
async function move(delta: number, y = 130) {
  await act(async () => window.dispatchEvent(new window.MouseEvent("pointermove", { clientX: 300 + delta, clientY: y })));
  const callbacks = [...requests.values()]; requests.clear();
  await act(async () => callbacks.forEach(callback => callback(now)));
}
async function release(delta: number, y = 130) { await act(async () => window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 300 + delta, clientY: y }))); }
async function space(focusTimeline = true) {
  const event = new window.KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true });
  await act(async () => {
    const timeline = view!.host.querySelector<HTMLElement>(".composition-timeline")!;
    if (focusTimeline) timeline.focus();
    globalThis.document.activeElement!.dispatchEvent(event);
  });
  return event;
}

it.each([
  ["mesma faixa", false, 130, 60, 60], ["ímã ligado", true, 130, 240, 150], ["outra faixa", false, 230, 60, 60], ["nova camada", false, 50, 60, 60],
] as const)("mover para %s preserva cursor, fonte, identidade e histórico", async (_target, magnetic, y, delta, start) => {
  const { document, before } = await mount(magnetic);
  if (!magnetic) await click("Ímã da faixa principal");
  await begin(); await move(delta, y);
  expect(time()).toBe("00:00:02.500");
  expect(item().dataset.startFrame).toBe(String(start));
  if (y !== 130) expect((await space(false)).defaultPrevented).toBe(true);
  await release(delta, y);
  expect(time()).toBe("00:00:02.500");
  await click("Desfazer (Ctrl+Z)");
  expect(item().dataset.startFrame).toBe("0"); expect(time()).toBe("00:00:02.500");
  await click("Refazer (Ctrl+Shift+Z)");
  expect(item().dataset.startFrame).toBe(String(start)); expect(time()).toBe("00:00:02.500");
  await click("Salvar");
  const saved = vi.mocked(ipc.saveEditorDocument).mock.calls[0][2];
  expect(saved.items.map(value => value.id)).toEqual(document.items.map(value => value.id));
  for (const original of document.items) expect(saved.items.find(value => value.id === original.id)).toMatchObject({ assetId: original.assetId, sourceStartUs: original.sourceStartUs, sourceEndUs: original.sourceEndUs, durationFrames: original.durationFrames });
  const moved = saved.items.find(value => value.id === "source-0-video")!;
  expect(moved.startFrame).toBe(start);
  if (y === 230) expect(moved.trackId).toBe("V2");
  else if (y === 50) expect(["V1", "V2"]).not.toContain(moved.trackId);
  else expect(moved.trackId).toBe("V1");
  expect(JSON.stringify(document)).toBe(before);
});

it("multisseleção move os dois trechos com distância e fontes preservadas sem perseguir o cursor", async () => {
  const { document } = await mount(true); await click("Ímã da faixa principal");
  const videos = document.items.filter(value => value.kind === "video" && value.trackId === "V1");
  await begin(videos[0].id, true); await begin(videos[1].id, true);
  await begin(videos[0].id);
  expect(view!.host.querySelectorAll('[data-kind="video"][data-selected="true"]')).toHaveLength(2);
  await space(false);
  expect(view!.host.querySelectorAll('[data-kind="video"][data-selected="true"]')).toHaveLength(2);
  expect(view!.host.querySelector('[aria-label="Reproduzir montagem"]')).not.toBeNull();
  expect(time()).toBe("00:00:02.500");
  await move(60); await release(60);
  expect(time()).toBe("00:00:02.500");
  expect(videos.map(value => item(value.id).dataset.startFrame)).toEqual(["60", "210"]);
  expect(videos.map(value => item(value.id).dataset.sourceStartUs)).toEqual(["2000000", "7000000"]);
});

it.each(["Escape", "blur", "pointercancel"])("cancelar movimento para camada nova por %s preserva documento e cursor", async reason => {
  await mount(); await click("Ímã da faixa principal"); await begin(); await move(60, 50);
  expect(time()).toBe("00:00:02.500");
  await act(async () => {
    if (reason === "Escape") window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    else window.dispatchEvent(new window.Event(reason));
  });
  await release(60, 50);
  expect(item().dataset.startFrame).toBe("0"); expect(time()).toBe("00:00:02.500");
  expect(view!.host.querySelectorAll('[data-composition-track][data-track-kind="visual"]')).toHaveLength(2);
  expect(view!.host.querySelector('[aria-label="Desfazer (Ctrl+Z)"]')?.getAttribute("aria-disabled")).toBe("true");
});

it.each(["confirmar", "cancelar"])("Space durante gesto não inicia o relógio e volta a funcionar após %s", async ending => {
  await mount(); await begin(); await space(false);
  expect(view!.host.querySelector('[aria-label="Reproduzir montagem"]')).not.toBeNull();
  expect(time()).toBe("00:00:02.500");
  if (ending === "confirmar") await release(0);
  else await act(async () => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
  await space();
  expect(view!.host.querySelector('[aria-label="Pausar montagem"]')).not.toBeNull();
  expect(time()).toBe("00:00:02.500");
});

it("clicar para selecionar pausa no frame editorial sem criar edição nem buscar a origem do item", async () => {
  await mount(); await click("Reproduzir montagem"); now = 1000;
  await begin();
  expect(view!.host.querySelector('[aria-label="Reproduzir montagem"]')).not.toBeNull();
  await release(0);
  expect(time()).toBe("00:00:02.500");
  expect(item().dataset.selected).toBe("true");
  expect(view!.host.querySelector('[aria-label="Desfazer (Ctrl+Z)"]')?.getAttribute("aria-disabled")).toBe("true");
});

it("destino bloqueado mantém o objeto e o cursor sem confirmar edição", async () => {
  await mount(false, true); await click("Ímã da faixa principal"); await begin(); await move(60, 230); await release(60, 230);
  expect(time()).toBe("00:00:02.500"); expect(item().dataset.startFrame).toBe("0");
  expect(view!.host.querySelector('[data-composition-track="V1"]')!.contains(item())).toBe(true);
  expect(view!.host.querySelector('[role="alert"]')).not.toBeNull();
  expect(view!.host.querySelector('[aria-label="Desfazer (Ctrl+Z)"]')?.getAttribute("aria-disabled")).toBe("true");
});

it.each(["confirmar", "cancelar"])("o foco acompanha o objeto remontado e Space funciona após %s sem refocus", async ending => {
  await mount(); await click("Ímã da faixa principal"); await begin(); await move(60, 230);
  if (ending === "confirmar") await release(60, 230);
  else await act(async () => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
  expect(globalThis.document.activeElement).toBe(item());
  await space(false);
  expect(view!.host.querySelector('[aria-label="Pausar montagem"]')).not.toBeNull();
  expect(time()).toBe("00:00:02.500");
});

it.each(["limiar", "erro"])("o estado provisório permanece ativo em %s até cancelar o gesto", async scenario => {
  await mount(false, scenario === "erro"); await click("Ímã da faixa principal"); await begin();
  await move(scenario === "erro" ? 60 : .1, scenario === "erro" ? 230 : 130);
  await act(async () => globalThis.document.activeElement!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true })));
  expect(view!.host.querySelectorAll('[data-composition-item][data-kind="video"]')).toHaveLength(2);
  await act(async () => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
  expect(time()).toBe("00:00:02.500");
});

it.each(["input", "textarea", "select", "editable", "source", "dialog", "menu", "outside"])("Space preserva o contexto %s e a escolha de foco feita após o gesto", async context => {
  await mount(); await click("Ímã da faixa principal"); await begin(); await move(60, 230);
  const target = globalThis.document.createElement(["input", "textarea", "select"].includes(context) ? context : "div");
  target.tabIndex = 0;
  if (context === "editable") target.setAttribute("contenteditable", "");
  if (context === "source") target.dataset.editorViewer = "source";
  if (context === "dialog" || context === "menu") target.setAttribute("role", context);
  (context === "outside" ? view!.host : view!.host.querySelector(".composition-timeline")!).append(target);
  await act(async () => target.focus());
  expect((await space(false)).defaultPrevented).toBe(false);
  await release(60, 230);
  expect(globalThis.document.activeElement).toBe(target);
  expect(time()).toBe("00:00:02.500");
});

it("Space com modificadores ou IME fica intacto durante gesto e repetição simples é consumida", async () => {
  await mount(); await begin();
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }]) {
    const event = new window.KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true, ...options });
    await act(async () => globalThis.document.activeElement!.dispatchEvent(event));
    expect(event.defaultPrevented, JSON.stringify(options)).toBe(false);
  }
  const repeated = new window.KeyboardEvent("keydown", { key: " ", code: "Space", repeat: true, bubbles: true, cancelable: true });
  await act(async () => globalThis.document.activeElement!.dispatchEvent(repeated));
  expect(repeated.defaultPrevented).toBe(true);
  expect(time()).toBe("00:00:02.500");
});
