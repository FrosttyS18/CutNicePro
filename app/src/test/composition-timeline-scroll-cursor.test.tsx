import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

const css = readFileSync(new URL("../components/editor/composition-timeline.css", import.meta.url), "utf8");
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; });

async function mount(frame = 150, emptyAuxiliaries = false) {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  const document = compositionFromLegacy(workspace);
  for (let index = 1; index < 50; index++) {
    const id = `V${index + 1}`;
    document.tracks.push({ ...document.tracks[0], id, name: `Camada ${index + 1}`, primary: false, locked: emptyAuxiliaries && index === 49 });
    if (!emptyAuxiliaries) document.items.push({ ...document.items[0], id: `item-${id}`, trackId: id, groupId: `group-${id}` });
  }
  const onSeek = vi.fn(), onRange = vi.fn(), onChange = vi.fn();
  const original = JSON.stringify(document);
  const render = (position = frame, value = document) => <CompositionTimeline document={value} frame={position} selected={[]} mode="select" range={null}
    onSelect={vi.fn()} onRange={onRange} onSeek={onSeek} onChange={onChange} onPreview={vi.fn()} onError={vi.fn()} onTrackChange={vi.fn()}/>;
  view = await reactHost(render(), environment => {
    const style = environment.document.createElement("style"); style.textContent = css; environment.document.head.append(style);
  });
  const viewport = view.host.querySelector<HTMLElement>(".composition-timeline__viewport")!;
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 800 }, clientHeight: { configurable: true, value: 220 },
    offsetWidth: { configurable: true, value: 806 }, offsetHeight: { configurable: true, value: 228 },
    getBoundingClientRect: { configurable: true, value: () => ({ left: 100, right: 906, top: 200, bottom: 428, width: 806, height: 228 }) },
  });
  await act(async () => window.dispatchEvent(new window.Event("resize")));
  return { viewport, onSeek, onRange, onChange, render, document, original };
}

function cursor() { return view!.host.querySelector<HTMLElement>(".composition-playhead")!; }
function handle() { return view!.host.querySelector<HTMLButtonElement>('[aria-label="Arrastar cursor da montagem"]')!; }
async function scroll(viewport: HTMLElement, left: number, top: number) {
  await act(async () => { viewport.scrollLeft = left; viewport.scrollTop = top; viewport.dispatchEvent(new window.Event("scroll", { bubbles: true })); });
}
async function enlarge() { await act(async () => view!.host.querySelector<HTMLButtonElement>('[aria-label="Aumentar zoom"]')!.click()); }

it("mantém régua e alça no plano vertical da viewport com cinquenta faixas e uma só rolagem", async () => {
  const { viewport } = await mount();
  const ruler = view!.host.querySelector<HTMLElement>(".composition-ruler")!;
  const overlay = view!.host.querySelector<HTMLElement>(".composition-timeline__cursor-layer");
  expect(window.getComputedStyle(ruler).position).toBe("sticky");
  expect(window.getComputedStyle(ruler).top).toBe("0px");
  expect(overlay).not.toBeNull();
  expect(viewport.contains(overlay)).toBe(false);
  expect(overlay!.parentElement).toBe(viewport.parentElement);
  expect(view!.host.querySelectorAll(".composition-timeline__viewport")).toHaveLength(1);
  expect(view!.host.querySelectorAll(".composition-playhead")).toHaveLength(1);
  expect(view!.host.querySelectorAll("[data-composition-track]")).toHaveLength(50);
  const top = window.getComputedStyle(cursor()).top;
  await scroll(viewport, 0, 1800);
  expect(window.getComputedStyle(cursor()).top).toBe(top);
  expect(window.getComputedStyle(handle()).top).toBe("6px");
});

it("recorta cursor e hit area fora do gutter e das barras usando a área útil recebida", async () => {
  const { viewport } = await mount();
  const overlay = view!.host.querySelector<HTMLElement>(".composition-timeline__cursor-layer");
  expect(overlay).not.toBeNull();
  expect(overlay!.style.width).toBe("800px");
  expect(overlay!.style.height).toBe("220px");
  const style = window.getComputedStyle(overlay!);
  expect(style.overflow).toBe("hidden");
  expect(style.clipPath).toBe("inset(0 0 0 144px)");
  expect(style.pointerEvents).toBe("none");
  expect(window.getComputedStyle(handle()).pointerEvents).toBe("auto");
  expect(Number(style.zIndex)).toBeGreaterThan(Number(window.getComputedStyle(view!.host.querySelector(".composition-ruler")!).zIndex));
  await enlarge();
  await scroll(viewport, 304, 1800);
  expect(parseFloat(cursor().style.left)).toBe(320);
});

it("régua e alça preservam o mesmo frame após rolar nos dois eixos e ampliar", async () => {
  const { viewport, onSeek, onChange } = await mount();
  await enlarge();
  await scroll(viewport, 90, 1800);
  expect(parseFloat(cursor().style.left)).toBe(534);
  await act(async () => {
    view!.host.querySelector(".composition-ruler__ticks")!.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 634, bubbles: true }));
    window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 634 }));
  });
  expect(onSeek).toHaveBeenLastCalledWith(150);
  onSeek.mockClear();
  await act(async () => {
    handle().dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 634, bubbles: true }));
    window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 634 }));
  });
  expect(onSeek).toHaveBeenLastCalledWith(150);
  expect(globalThis.document.activeElement).toBe(handle());
  expect(onChange).not.toHaveBeenCalled();
});

it.each(["Escape", "blur", "pointercancel"])("cancelar por %s restaura o frame e desliga os listeners do cursor", async reason => {
  const { onSeek } = await mount(75);
  await act(async () => {
    handle().dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 500, bubbles: true }));
    if (reason === "Escape") window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    else window.dispatchEvent(new window.Event(reason));
  });
  expect(onSeek).toHaveBeenLastCalledWith(75);
  const count = onSeek.mock.calls.length;
  await act(async () => window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 700 })));
  expect(onSeek).toHaveBeenCalledTimes(count);
});

it("cursor único permanece nos extremos corretos e aceita teclado sem editar a montagem", async () => {
  const { render, onSeek, onChange } = await mount(0);
  expect(parseFloat(cursor().style.left)).toBe(168);
  await act(async () => {
    handle().focus();
    handle().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
  });
  expect(onSeek).toHaveBeenLastCalledWith(0);
  await act(async () => handle().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true })));
  expect(onSeek).toHaveBeenLastCalledWith(10);
  await view!.render(render(300));
  expect(parseFloat(cursor().style.left)).toBe(776);
  await act(async () => handle().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
  expect(onSeek).toHaveBeenLastCalledWith(300);
  expect(view!.host.querySelectorAll(".composition-playhead")).toHaveLength(1);
  expect(onChange).not.toHaveBeenCalled();
});

it("omite auxiliares vazias legadas sem mutação e conserva a bloqueada enquanto mantém foco", async () => {
  const { document, render, onChange, original } = await mount(150, true);
  expect([...view!.host.querySelectorAll<HTMLElement>("[data-composition-track]")].map(lane => lane.dataset.compositionTrack)).toEqual(["V50", "V1"]);
  const lock = view!.host.querySelector<HTMLButtonElement>('[aria-label="Bloquear faixa Camada 50"]')!;
  await act(async () => lock.focus());
  const unlocked = { ...document, tracks: document.tracks.map(track => track.id === "V50" ? { ...track, locked: false } : track) };
  await view!.render(render(150, unlocked));
  expect(globalThis.document.activeElement).toBe(lock);
  expect(view!.host.querySelector('[data-composition-track="V50"]')).not.toBeNull();
  await act(async () => view!.host.querySelector<HTMLButtonElement>('[aria-label="Bloquear faixa Principal"]')!.focus());
  expect(view!.host.querySelectorAll("[data-composition-track]")).toHaveLength(1);
  expect(JSON.stringify(document)).toBe(original);
  expect(onChange).not.toHaveBeenCalled();
});
