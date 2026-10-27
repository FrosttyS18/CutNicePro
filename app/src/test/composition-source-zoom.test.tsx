import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionSource } from "../components/editor/CompositionSource";
import type { CompositionAsset } from "../lib/composition-types";
import { reactHost } from "./react-host";

let view: Awaited<ReturnType<typeof reactHost>> | undefined;
const insert = vi.fn();
const asset: CompositionAsset = { id: "source", mediaId: "source", name: "Fonte.mp4", kind: "video", durationUs: 10_000_000, width: 640, height: 360, transcript: [] };
afterEach(async () => { await view?.close(); view = undefined; vi.restoreAllMocks(); vi.clearAllMocks(); });

async function mount(duration = 10) {
  view = await reactHost(<CompositionSource asset={{ ...asset, durationUs: duration * 1e6 }} url="blob:source"
    frames={["blob:first", "blob:middle", "blob:last"]} fps={{ numerator: 24, denominator: 1 }} onInsert={insert} onActivate={vi.fn()}/>);
  const viewport = view.host.querySelector<HTMLElement>(".composition-source-range__viewport");
  expect(viewport, "a fonte precisa de uma viewport temporal com rolagem").not.toBeNull();
  let available = 1000;
  Object.defineProperties(viewport!, {
    clientWidth: { configurable: true, get: () => available },
    getBoundingClientRect: { configurable: true, value: () => ({ left: 100, right: 100 + available, width: available, top: 0, bottom: 68, height: 68 }) },
  });
  await act(async () => window.dispatchEvent(new window.Event("resize")));
  const track = view.host.querySelector<HTMLElement>('[aria-label="Posição na fonte"]')!;
  Object.defineProperty(track, "getBoundingClientRect", { configurable: true, value: () => ({ left: 100 - viewport!.scrollLeft, width: width(), top: 0, height: 48 }) });
  function width() { return parseFloat(track.style.width); }
  return { viewport: viewport!, track, width, async resize(next: number) { available = next; await act(async () => window.dispatchEvent(new window.Event("resize"))); } };
}
async function wheel(target: HTMLElement, deltaY: number, clientX = 600, ctrlKey = true) {
  const event = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY, clientX, ctrlKey });
  Object.defineProperties(event, { ctrlKey: { value: ctrlKey }, clientX: { value: clientX } });
  await act(async () => target.dispatchEvent(event));
  return event;
}
async function pointer(target: EventTarget, type: string, clientX: number) {
  await act(async () => target.dispatchEvent(new window.MouseEvent(type, { button: 0, clientX, bubbles: true, cancelable: true })));
}
async function key(target: HTMLElement, value: string) {
  await act(async () => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
}
function edge(name: "início" | "fim") { return view!.host.querySelector<HTMLElement>(`[aria-label="Ajustar ${name} na fonte"]`)!; }

it("Ctrl + roda amplia sob o mouse sem mudar seleção, posição da fonte ou inserir na montagem", async () => {
  const { viewport, track, width } = await mount();
  const event = await wheel(track, -100, 850);
  expect(event.defaultPrevented).toBe(true);
  expect(width()).toBeGreaterThan(1000);
  expect((viewport.scrollLeft + 750) / width()).toBeCloseTo(.75, 8);
  expect(edge("início").getAttribute("aria-valuenow")).toBe("0");
  expect(edge("fim").getAttribute("aria-valuenow")).toBe("10");
  expect(view!.host.querySelector<HTMLVideoElement>("video")!.currentTime).toBe(0);
  expect(insert).not.toHaveBeenCalled();
});

it.each([[200, 600], [600, 200]])("seleção após zoom e rolagem de %s a %s mantém tempos corretos e Enter insere uma vez", async (from, to) => {
  const { viewport, track, width } = await mount();
  await wheel(track, -100);
  await act(async () => { viewport.scrollLeft = 300; viewport.dispatchEvent(new window.Event("scroll")); });
  const scale = width();
  const expected = [from, to].sort((a, b) => a - b).map(x => Math.round((x - 100 + 300) / scale * 10 * 24) / 24);
  await pointer(track, "pointerdown", from);
  await pointer(window, "pointermove", to);
  await pointer(window, "pointerup", to);
  await key(track, "Enter");
  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert.mock.calls[0][0]).toBeCloseTo(expected[0], 6);
  expect(insert.mock.calls[0][1]).toBeCloseTo(expected[1], 6);
});

it("alça ampliada preserva um frame, bloqueia zoom durante arraste e Escape restaura o intervalo", async () => {
  const { track, width } = await mount();
  await wheel(track, -100);
  const before = width();
  await pointer(edge("início"), "pointerdown", 100);
  await pointer(window, "pointermove", 10000);
  expect(Number(edge("início").getAttribute("aria-valuenow"))).toBeCloseTo(10 - 1 / 24, 6);
  await wheel(track, -100);
  expect(width()).toBe(before);
  await key(edge("início"), "Escape");
  expect(edge("início").getAttribute("aria-valuenow")).toBe("0");
  await pointer(window, "pointerup", 10000);
  expect(edge("início").getAttribute("aria-valuenow")).toBe("0");
  await wheel(track, -100);
  expect(width()).toBeGreaterThan(before);
});

it.each([1 / 24, 10, 1435, 7200])("zoom da fonte de %ss tem limites finitos, miniaturas limitadas e volta ao enquadramento inicial", async duration => {
  const { viewport, track, width } = await mount(duration);
  for (let index = 0; index < 65; index++) await wheel(track, -100);
  const maximum = width();
  expect(Number.isFinite(maximum)).toBe(true);
  expect(maximum).toBeGreaterThan(1000);
  expect(maximum).toBeLessThanOrEqual(16_000_000);
  await wheel(track, -100);
  expect(width()).toBe(maximum);
  expect(view!.host.querySelectorAll('.composition-source-range__frames img').length).toBeLessThanOrEqual(20);
  for (let index = 0; index < 65; index++) await wheel(track, 100);
  expect(width()).toBe(1000);
  expect(viewport.scrollLeft).toBe(0);
  await wheel(track, -100);
  expect(width()).toBeGreaterThan(1000);
  expect(insert).not.toHaveBeenCalled();
});

it("resize mantém o centro temporal, limita a rolagem e preserva seleção", async () => {
  const { viewport, track, width, resize } = await mount();
  await wheel(track, -100);
  const center = (viewport.scrollLeft + 500) / width();
  await resize(600);
  expect((viewport.scrollLeft + 300) / width()).toBeCloseTo(center, 8);
  expect(viewport.scrollLeft).toBeGreaterThanOrEqual(0);
  expect(viewport.scrollLeft).toBeLessThanOrEqual(width() - 600);
  expect(edge("início").getAttribute("aria-valuenow")).toBe("0");
  expect(edge("fim").getAttribute("aria-valuenow")).toBe("10");
});

it("resize durante a seleção usa a geometria atual sem deslocar a âncora temporal", async () => {
  const { viewport, track, width, resize } = await mount();
  await wheel(track, -100);
  await pointer(track, "pointerdown", 300);
  const anchor = Number(view!.host.querySelector<HTMLVideoElement>("video")!.currentTime);
  await resize(600);
  const expectedEnd = Math.round((600 - 100 + viewport.scrollLeft) / width() * 10 * 24) / 24;
  await pointer(window, "pointermove", 600);
  await pointer(window, "pointerup", 600);
  await key(track, "Enter");
  expect(insert).toHaveBeenCalledWith(anchor, expectedEnd);
});

it("eventos de zoom na mesma atualização preservam a âncora sem depender da renderização intermediária", async () => {
  const { viewport, track, width } = await mount();
  await act(async () => {
    for (let index = 0; index < 5; index++) {
      const event = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
      Object.defineProperties(event, { ctrlKey: { value: true }, clientX: { value: 600 } });
      track.dispatchEvent(event);
    }
  });
  expect((viewport.scrollLeft + 500) / width()).toBeCloseTo(.5, 8);
});

it("roda comum mantém a rolagem normal e desmontar remove o listener do zoom", async () => {
  const { viewport, track, width } = await mount();
  const normal = await wheel(track, -100, 600, false);
  expect(normal.defaultPrevented).toBe(false);
  expect(width()).toBe(1000);
  const afterClose = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
  Object.defineProperty(afterClose, "ctrlKey", { value: true });
  await view!.close(); view = undefined;
  viewport.dispatchEvent(afterClose);
  expect(afterClose.defaultPrevented).toBe(false);
});
