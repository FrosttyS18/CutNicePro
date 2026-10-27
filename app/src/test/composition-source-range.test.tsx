import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionSource } from "../components/editor/CompositionSource";
import type { CompositionAsset } from "../lib/composition-types";
import { reactHost } from "./react-host";

const asset: CompositionAsset = { id: "source", mediaId: "source", name: "Fonte.mp4", kind: "video", durationUs: 10_000_000, width: 640, height: 360, transcript: [] };
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
const insert = vi.fn();
afterEach(async () => { await view?.close(); view = undefined; vi.restoreAllMocks(); vi.clearAllMocks(); });

async function mount(source = asset, url: string | null = "blob:source") {
  view = await reactHost(<CompositionSource asset={source} url={url} frames={["blob:first", "blob:middle", "blob:last"]}
    fps={{ numerator: 24, denominator: 1 }} onInsert={insert} onActivate={vi.fn()}/>);
}
function track() {
  const element = view!.host.querySelector<HTMLElement>('[aria-label="Posição na fonte"]')!;
  expect(element).not.toBeNull();
  Object.defineProperty(element, "getBoundingClientRect", { configurable: true, value: () => ({ left: 100, right: 1100, top: 0, bottom: 48, width: 1000, height: 48 }) });
  return element;
}
function marks() { return [...view!.host.querySelectorAll(".composition-source__marks output")].map(value => value.textContent); }
async function pointer(target: EventTarget, type: string, clientX: number) {
  await act(async () => target.dispatchEvent(new window.MouseEvent(type, { button: 0, clientX, bubbles: true, cancelable: true })));
}
async function key(target: HTMLElement, value: string) {
  await act(async () => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
}
async function select(from: number, to: number) {
  await pointer(track(), "pointerdown", from);
  await pointer(window, "pointermove", to);
  await pointer(window, "pointerup", to);
}

it.each([[300, 700], [700, 300]])("arrastar de %s a %s seleciona 2–6 s e Enter confirma sem inserir durante o gesto", async (from, to) => {
  await mount();
  expect(view!.host.querySelectorAll('.composition-source-range__frames img')).toHaveLength(3);
  await select(from, to);
  expect(marks()).toEqual(["00:02", "00:06"]);
  expect(insert).not.toHaveBeenCalled();
  await key(track(), "Enter");
  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert).toHaveBeenCalledWith(2, 6);
});

it("clique busca a fonte sem trocar a seleção; as miniaturas usam apenas os frames recebidos", async () => {
  await mount();
  expect([...view!.host.querySelectorAll('.composition-source-range__frames img')].map(value => value.getAttribute("src")))
    .toEqual(["blob:first", "blob:middle", "blob:last"]);
  await select(500, 500);
  expect(view!.host.querySelector<HTMLVideoElement>("video")!.currentTime).toBe(4);
  expect(marks()).toEqual(["00:00", "00:10"]);
  expect(insert).not.toHaveBeenCalled();
});

it("seleção e alças ficam dentro da fonte e preservam pelo menos um frame", async () => {
  await mount();
  await select(-200, 1500);
  expect(marks()).toEqual(["00:00", "00:10"]);
  await select(300, 700);
  const start = view!.host.querySelector<HTMLElement>('[aria-label="Ajustar início na fonte"]')!;
  await pointer(start, "pointerdown", 300);
  await pointer(window, "pointermove", 1000);
  await pointer(window, "pointerup", 1000);
  expect(Number(start.getAttribute("aria-valuenow"))).toBeCloseTo(6 - 1 / 24, 6);
  await key(track(), "Enter");
  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert).toHaveBeenCalledWith(6 - 1 / 24, 6);
});

it("alças também ajustam o intervalo por teclado sem mover o cursor da fonte", async () => {
  await mount();
  await select(300, 700);
  const video = view!.host.querySelector<HTMLVideoElement>("video")!;
  const previous = video.currentTime;
  const end = view!.host.querySelector<HTMLElement>('[aria-label="Ajustar fim na fonte"]')!;
  await key(end, "ArrowLeft");
  expect(Number(end.getAttribute("aria-valuenow"))).toBeCloseTo(6 - 1 / 24, 6);
  expect(video.currentTime).toBe(previous);
  expect(insert).not.toHaveBeenCalled();
});

it.each(["Escape", "pointercancel", "blur"])("%s cancela a seleção em andamento e ignora eventos tardios", async reason => {
  await mount();
  await select(300, 700);
  await pointer(track(), "pointerdown", 200);
  await pointer(window, "pointermove", 900);
  expect(marks()).toEqual(["00:01", "00:08"]);
  if (reason === "Escape") await key(track(), "Escape");
  else await act(async () => window.dispatchEvent(new window.Event(reason)));
  await pointer(window, "pointerup", 1100);
  expect(marks()).toEqual(["00:02", "00:06"]);
  expect(insert).not.toHaveBeenCalled();
});

it("desmontar durante o gesto remove todos os listeners temporários", async () => {
  await mount();
  const add = vi.spyOn(window, "addEventListener");
  const remove = vi.spyOn(window, "removeEventListener");
  await pointer(track(), "pointerdown", 300);
  const listeners = add.mock.calls.filter(([type]) => ["pointermove", "pointerup", "pointercancel", "blur", "keydown"].includes(type));
  expect(new Set(listeners.map(([type]) => type)).size).toBe(5);
  await view!.close(); view = undefined;
  for (const [type, listener] of listeners) expect(remove.mock.calls.some(([removedType, removed]) => removedType === type && removed === listener)).toBe(true);
  expect(insert).not.toHaveBeenCalled();
});

it("Enter só confirma depois de soltar o arraste",async()=>{
  await mount();
  await pointer(track(),"pointerdown",300);await pointer(window,"pointermove",700);
  await key(track(),"Enter");expect(insert).not.toHaveBeenCalled();
  await pointer(window,"pointerup",700);await key(track(),"Enter");
  expect(insert).toHaveBeenCalledTimes(1);expect(insert).toHaveBeenCalledWith(2,6);
});

it("imagem usa a prévia real sem faixa temporal e áudio não inventa miniaturas de vídeo", async () => {
  await mount({ ...asset, kind: "image", durationUs: 0, name: "Foto.png" }, "blob:photo");
  expect(view!.host.querySelector('img')?.getAttribute("src")).toBe("blob:photo");
  expect(view!.host.querySelector('[aria-label="Posição na fonte"]')).toBeNull();
  await view!.close(); view = undefined;
  await mount({ ...asset, kind: "audio", name: "Áudio.wav", width: 0, height: 0 });
  expect(view!.host.querySelector("audio")).not.toBeNull();
  expect(view!.host.querySelector("video,img")).toBeNull();
  expect(view!.host.textContent).toContain("Fonte de áudio");
  expect(view!.host.querySelector('[aria-label="Posição na fonte"]')).not.toBeNull();
});
