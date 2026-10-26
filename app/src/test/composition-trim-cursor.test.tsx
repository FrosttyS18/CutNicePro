import { act, useEffect, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionEditor } from "../components/editor/CompositionEditor";
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

async function click(label: string) {
  const button = view!.host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  expect(button, label).not.toBeNull();
  await act(async () => button.click());
}
async function mount(position = 75) {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 20, width: 1920, height: 1080, videoId: null, url: null };
  data.settings.trimStart = 2; data.settings.trimEnd = 12;
  vi.stubGlobal("performance", { now: () => now });
  view = await reactHost(<CompositionEditor projectId="project" title="Projeto" data={data} localUrl="source.mp4" onBack={vi.fn()}/>, environment => {
    Object.defineProperty(environment, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => { const id = ++sequence; requests.set(id, callback); return id; } });
    Object.defineProperty(environment, "cancelAnimationFrame", { configurable: true, value: (id: number) => requests.delete(id) });
  });
  const viewport = view.host.querySelector<HTMLElement>(".composition-timeline__viewport")!;
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 840 }, clientHeight: { configurable: true, value: 200 },
    scrollWidth: { configurable: true, value: 2400 },
    getBoundingClientRect: { configurable: true, value: () => ({ left: 0, right: 840, top: 0, bottom: 200, width: 840, height: 200 }) },
  });
  await act(async () => window.dispatchEvent(new window.Event("resize")));
  await click("Posição precisa");
  const field = view.host.querySelector<HTMLInputElement>('[aria-label="Cursor da montagem em frames"]')!;
  await act(async () => { field.value = String(position); field.dispatchEvent(new window.Event("input", { bubbles: true })); });
  return viewport;
}
function edge(side: "start" | "end") { return view!.host.querySelector<HTMLButtonElement>(`[aria-label="Ajustar ${side === "start" ? "início" : "fim"} de Fonte.mp4"]`)!; }
function time() { return view!.host.querySelector(".composition-timeline__time")?.textContent; }
function video() { return view!.host.querySelector<HTMLElement>('[data-kind="video"][data-composition-item]')!; }
async function begin(side: "start" | "end") {
  await act(async () => edge(side).dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 500, bubbles: true })));
}
async function move(delta: number) {
  await act(async () => window.dispatchEvent(new window.MouseEvent("pointermove", { clientX: 500 + delta * 2 })));
  const callbacks = [...requests.values()]; requests.clear();
  await act(async () => callbacks.forEach(callback => callback(now)));
}
async function release(delta: number) { await act(async () => window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 500 + delta * 2 }))); }

it.each([
  ["start", 20, true], ["end", -20, true], ["start", 20, false], ["end", -20, false],
] as const)("aparar %s com delta %s e ímã %s preserva o cursor na prévia e na confirmação", async (side, delta, magnetic) => {
  await mount();
  if (!magnetic) await click("Ímã da faixa principal");
  await begin(side); await move(delta);
  expect(time()).toBe("00:00:02.500");
  expect(video().style.width).toBe("560px");
  await release(delta);
  expect(time()).toBe("00:00:02.500");
  await click("Desfazer (Ctrl+Z)");
  expect(video().style.width).toBe("600px");
  expect(time()).toBe("00:00:02.500");
  await click("Refazer (Ctrl+Shift+Z)");
  expect(video().style.width).toBe("560px");
  expect(time()).toBe("00:00:02.500");
  expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
});

it.each(["Escape", "blur", "pointercancel"])("cancelar trim após encurtar além do cursor por %s conserva sua posição editorial", async reason => {
  await mount(290); await begin("end"); await move(-60);
  expect(time()).toBe("00:00:09.666");
  expect(video().style.width).toBe("480px");
  await act(async () => {
    if (reason === "Escape") window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    else window.dispatchEvent(new window.Event(reason));
  });
  expect(time()).toBe("00:00:09.666");
  expect(video().style.width).toBe("600px");
  await release(-60);
  expect(video().style.width).toBe("600px");
  expect(time()).toBe("00:00:09.666");
  expect(view!.host.querySelector('[aria-label="Desfazer (Ctrl+Z)"]')?.getAttribute("aria-disabled")).toBe("true");
});

it("mantém cursor pós-fim e escala ao aparar, mas salva só a duração real e Space reinicia em zero", async () => {
  const viewport = await mount(290);
  await click("Aumentar zoom");
  const duration = 300;
  const scale = parseFloat(video().style.width) / duration;
  await begin("end");
  await move(-60 * 1.5);
  expect(time()).toBe("00:00:09.666");
  expect(parseFloat(video().style.width)).toBe(720);
  expect(view!.host.querySelector<HTMLElement>(".composition-timeline__content")!.style.width).toBe("1110px");
  expect(parseFloat(view!.host.querySelector<HTMLElement>(".composition-playhead")!.style.left) + viewport.scrollLeft).toBe(1062);
  expect(scale).toBe(3);
  await release(-60 * 1.5);
  await click("Salvar");
  const saved = vi.mocked(ipc.saveEditorDocument).mock.calls[0][2];
  expect(Math.max(...saved.items.map(item => item.startFrame + item.durationFrames))).toBe(240);
  await act(async () => {
    const timeline = view!.host.querySelector<HTMLElement>(".composition-timeline")!; timeline.focus();
    timeline.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
  });
  expect(time()).toBe("00:00:00.000");
  expect(view!.host.querySelector('[aria-label="Pausar montagem"]')).not.toBeNull();
});

it("iniciar trim durante reprodução pausa no último frame editorial sem ler avanço novo do relógio", async () => {
  await mount(); await click("Reproduzir montagem");
  now = 1000;
  await begin("end");
  expect(time()).toBe("00:00:02.500");
  expect(view!.host.querySelector('[aria-label="Reproduzir montagem"]')).not.toBeNull();
  await release(0);
  expect(time()).toBe("00:00:02.500");
});

it.each(["start", "end"] as const)("trim de %s por teclado pausa e preserva o cursor editorial", async side => {
  await mount(); await click("Reproduzir montagem"); now = 1000;
  await act(async () => edge(side).dispatchEvent(new window.KeyboardEvent("keydown", { key: side === "start" ? "ArrowRight" : "ArrowLeft", bubbles: true, cancelable: true })));
  expect(time()).toBe("00:00:02.500");
  expect(video().style.width).toBe("598px");
  expect(view!.host.querySelector('[aria-label="Reproduzir montagem"]')).not.toBeNull();
});
