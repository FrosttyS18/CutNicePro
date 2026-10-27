import { act, useRef } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionFraming } from "../components/editor/useCompositionFraming";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { visualContentStyle } from "../lib/composition-placement";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
import type { CompositionSnapGuides } from "../lib/composition-preview-snap";
import { reactHost } from "./react-host";

const bootstrap = await vi.hoisted(async () => {
  const { Window } = await import("happy-dom");
  const environment = new Window({ url: "http://localhost" });
  vi.stubGlobal("window", environment);
  vi.stubGlobal("document", environment.document);
  return environment;
});

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.restoreAllMocks(); });
afterAll(async () => { await bootstrap.happyDOM.cancelAsync(); vi.unstubAllGlobals(); });

function fixture(fit: "contain" | "cover" = "contain", primary = true): Composition {
  const value = compositionFromLegacy(emptyWorkspace());
  value.settings.ratio = "9:16";
  value.assets = [{ id: "source", mediaId: "media", name: "Original.mp4", kind: "video", width: 1920, height: 1080, durationUs: 2_000_000, transcript: [] }];
  value.tracks = [{ id: "V1", name: "Principal", kind: "visual", primary, locked: false, hidden: false, muted: false }];
  value.items = [{ id: "visual", assetId: "source", trackId: "V1", kind: "video", startFrame: 0, durationFrames: 60, sourceStartUs: 0, sourceEndUs: 2_000_000,
    groupId: "visual", followsMain: true, settings: { ...value.settings, fit, focalPoint: { x: 50, y: 50 }, zoom: 1 }, captionEdits: {} }];
  return value;
}

interface CanvasProps { value: Composition; mode?: "crop" | "placement"; frame?: number; playing?: boolean; viewportRevision?: number; selectedId?: string | null; onSelect?: (id: string) => void; onSnapGuides?: (guides: CompositionSnapGuides) => void; preview: (value: Composition | null) => void; change: (value: Composition) => void; pause: () => void; error: (message: string) => void }
function Canvas({ value, mode = "crop", frame = 0, playing = false, viewportRevision, selectedId, onSelect, onSnapGuides, preview, change, pause, error }: CanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const item = selectedId === undefined ? value.items[0] : value.items.find(value => value.id === selectedId);
  const pointer = useCompositionFraming({ document: value, item, time: 0, frame, playing, viewportRevision, selectionKey: selectedId === undefined ? undefined : selectedId ?? "", onSelect, onSnapGuides, onPause: pause, stageRef: container, enabled: true, mode, onPreview: preview, onChange: change, onError: error });
  return <div ref={container} onPointerDown={pointer}><div className="composition-stage">{value.items.filter(value => value.kind === "image" || value.kind === "video").map(value => <div key={value.id} data-composition-layer={value.id}><img alt={value.id}/></div>)}</div>
    <span data-composition-selection="visual" data-test-corner onPointerDown={event => pointer(event, "se")} /></div>;
}

async function setup(value: Composition, mode: "crop" | "placement" = "crop", frame = 0, playing = false) {
  const change = vi.fn(), preview = vi.fn(), pause = vi.fn(), error = vi.fn();
  const props = { value, mode, frame, playing, change, preview, pause, error };
  mounted = await reactHost(<Canvas {...props} />);
  const stage = mounted.host.querySelector<HTMLElement>(".composition-stage")!;
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 108, height: 192 } as DOMRect);
  const event = (type: string, x: number, y: number) => new window.PointerEvent(type, { button: 0, clientX: x, clientY: y, pointerId: 4, bubbles: true });
  const down = async (x = 54, y = 96, corner = false) => act(async () => { mounted!.host.querySelector(corner ? "[data-test-corner]" : "img")!.dispatchEvent(event("pointerdown", x, y)); });
  const move = async (x: number, y: number) => act(async () => { window.dispatchEvent(event("pointermove", x, y)); });
  const up = async (x: number, y: number) => act(async () => { window.dispatchEvent(event("pointerup", x, y)); });
  return { props, change, preview, pause, error, down, move, up };
}

describe("geometria e lifecycle do gesto na prévia", () => {
  it("move contain para cima ao arrastar para cima, usando a margem real", async () => {
    const state = await setup(fixture());
    await state.down(); await state.up(54, 86);
    const point = (state.change.mock.calls[0][0] as Composition).items[0].settings.focalPoint!;
    expect(point.y).toBeCloseTo(50 - 100 / 1312 * 100, 6);
    expect(point.x).toBe(50);
    expect(state.change).toHaveBeenCalledOnce();
    expect(state.preview).toHaveBeenLastCalledWith(null);
  });

  it("move cover para direita pela área excedente sem mudar o eixo sem recorte", async () => {
    const value = fixture("cover");
    const state = await setup(value);
    await state.down(); await state.up(64, 86);
    const changed = state.change.mock.calls[0][0] as Composition;
    const style = visualContentStyle(value.assets[0], changed.items[0].settings, { width: 1080, height: 1920 });
    expect(Number.parseFloat(String(style.left)) * 1080 / 100).toBeCloseTo(-1066, 0);
    expect(changed.items[0].settings.focalPoint!.y).toBe(50);
  });

  it("permite mover placement da principal e pausa antes do gesto", async () => {
    const state = await setup(fixture(), "placement", 0, true);
    await state.down(); await state.up(64.8, 76.8);
    expect((state.change.mock.calls[0][0] as Composition).items[0].placement).toEqual({ x: 60, y: 40, scale: 1, opacity: 1 });
    expect(state.pause).toHaveBeenCalledOnce();
  });

  it("redimensiona uniforme pelo canto sem alterar crop e confirma uma vez", async () => {
    const value = fixture(); value.items[0].placement = { x: 50, y: 50, scale: 0.5, opacity: 0.6 };
    const state = await setup(value, "placement");
    await state.down(81, 111.2, true); await state.move(90, 117); await state.up(108, 126.4);
    const changed = state.change.mock.calls[0][0] as Composition;
    expect(changed.items[0].placement!.scale).toBeCloseTo(0.75, 8);
    expect(changed.items[0].placement!.x).toBeCloseTo(62.5, 8);
    expect(changed.items[0].placement!.opacity).toBe(0.6);
    expect(changed.items[0].settings).toEqual(value.items[0].settings);
    expect(state.change).toHaveBeenCalledOnce();
    expect(state.preview).toHaveBeenLastCalledWith(null);
  });

  it.each(["Escape", "pointercancel", "blur", "resize"])("cancela %s e limpa a prévia sem confirmar", async reason => {
    const state = await setup(fixture("contain", false), "placement");
    await state.down(); await state.move(70, 80);
    await act(async () => { if (reason === "Escape") window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })); else window.dispatchEvent(new window.Event(reason)); });
    expect(state.change).not.toHaveBeenCalled();
    expect(state.preview).toHaveBeenLastCalledWith(null);
    await state.up(70, 80);
    expect(state.change).not.toHaveBeenCalled();
  });

  it("limpa a prévia ao desmontar durante um gesto", async () => {
    const state = await setup(fixture("contain", false), "placement");
    await state.down(); await state.move(70, 80);
    await mounted!.close(); mounted = undefined;
    expect(state.preview).toHaveBeenLastCalledWith(null);
    expect(state.change).not.toHaveBeenCalled();
  });

  it.each(["locked", "hidden", "outside"])("não move item %s", async reason => {
    const value = fixture("contain", false);
    if (reason === "locked") value.tracks[0].locked = true;
    if (reason === "hidden") value.tracks[0].hidden = true;
    const state = await setup(value, "placement", reason === "outside" ? 60 : 0);
    await state.down(); await state.up(70, 80);
    expect(state.change).not.toHaveBeenCalled();
    if (reason === "locked") expect(state.error).toHaveBeenCalledWith("A faixa selecionada está bloqueada");
  });

  it("não move ao começar na margem preta de uma camada contain", async () => {
    const state = await setup(fixture("contain", false), "placement");
    await act(async () => { mounted!.host.querySelector("[data-composition-layer]")!.dispatchEvent(new window.PointerEvent("pointerdown", { button: 0, clientX: 54, clientY: 20, pointerId: 4, bubbles: true })); });
    await state.up(70, 30);
    expect(state.change).not.toHaveBeenCalled();
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("coalesce movimentos por rAF e mantém o baseline durante preview de document", async () => {
    const state = await setup(fixture(), "placement");
    let draw: FrameRequestCallback | undefined;
    const schedule = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { draw = callback; return 1; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    await state.down(); await state.move(60, 90); await state.move(70, 80);
    expect(schedule).toHaveBeenCalledOnce();
    expect(state.preview).not.toHaveBeenCalled();
    await act(async () => { draw!(0); });
    const previewed = state.preview.mock.calls[0][0] as Composition;
    await mounted!.render(<Canvas {...state.props} value={previewed} />);
    expect(state.preview).toHaveBeenCalledOnce();
    await state.up(75.6, 57.6);
    expect(state.change).toHaveBeenCalledOnce();
    expect((state.change.mock.calls[0][0] as Composition).items[0].placement).toEqual({ x: 70, y: 30, scale: 1, opacity: 1 });
    expect(state.props.value.items[0].placement).toBeUndefined();
  });

  it("cancela mudança externa de frame e não confirma o retângulo anterior", async () => {
    const state = await setup(fixture(), "placement");
    await state.down(); await state.move(70, 80);
    await mounted!.render(<Canvas {...state.props} frame={1} />);
    expect(state.preview).toHaveBeenLastCalledWith(null);
    await state.up(75, 60);
    expect(state.change).not.toHaveBeenCalled();
  });

  it("cancela a transformação pendente ao navegar no zoom da prévia", async () => {
    const state = await setup(fixture(), "placement");
    await state.down(); await state.move(70, 80);
    await mounted!.render(<Canvas {...state.props} viewportRevision={1} />);
    expect(state.preview).toHaveBeenLastCalledWith(null);
    await state.up(75, 60);
    expect(state.change).not.toHaveBeenCalled();
  });

  it("encaixa no centro ao arrastar, confirma uma vez e remove as guias ao soltar", async () => {
    const value = fixture(); value.items[0].placement = { x: 45, y: 45, scale: 1, opacity: 1 };
    const state = await setup(value, "placement"), guides = vi.fn();
    await mounted!.render(<Canvas {...state.props} onSnapGuides={guides}/>);
    await state.down(); await state.up(57, 102);
    expect(guides).toHaveBeenCalledWith({ x: 540, y: 960 });
    expect(guides).toHaveBeenLastCalledWith({});
    expect(state.change).toHaveBeenCalledOnce();
    expect((state.change.mock.calls[0][0] as Composition).items[0].placement).toEqual({ x: 50, y: 50, scale: 1, opacity: 1 });
    expect(state.preview).toHaveBeenLastCalledWith(null);
  });

  it("Alt permite ajuste livre perto do centro e um clique sem arrastar não desloca o objeto", async () => {
    const value = fixture(); value.items[0].placement = { x: 48, y: 48, scale: 1, opacity: 1 };
    const state = await setup(value, "placement"), guides = vi.fn();
    await mounted!.render(<Canvas {...state.props} onSnapGuides={guides}/>);
    await state.down(); await state.up(54, 96);
    expect(state.change).not.toHaveBeenCalled();
    await state.down();
    await act(async () => { window.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 4, clientX: 57, clientY: 99, altKey: true })); });
    const placement = (state.change.mock.calls[0][0] as Composition).items[0].placement!;
    expect(placement.x).toBeCloseTo(48 + 3 / 108 * 100);
    expect(placement.y).toBeCloseTo(48 + 3 / 192 * 100);
    expect(guides).not.toHaveBeenCalledWith({ x: 540, y: 960 });
  });

  it.each([[20, 4, 50 + 20 / 108 * 100, 48], [4, -20, 50, 48 - 20 / 192 * 100]])("Shift prende o eixo dominante (%s,%s) e não encaixa o eixo fixo", async (dx, dy, expectedX, expectedY) => {
    const value = fixture(); value.items[0].placement = { x: 50, y: 48, scale: 0.5, opacity: 1 };
    const state = await setup(value, "placement");
    await state.down();
    await act(async () => { window.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 4, clientX: 54 + dx, clientY: 96 + dy, shiftKey: true })); });
    const placement = (state.change.mock.calls[0][0] as Composition).items[0].placement!;
    expect(placement.x).toBeCloseTo(expectedX, 8);
    expect(placement.y).toBeCloseTo(expectedY, 8);
  });

  it("pressionar e soltar Shift no gesto trava e libera o movimento sem perder Alt", async () => {
    const state = await setup(fixture(), "placement");
    await state.down();
    await act(async () => { window.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 4, clientX: 74, clientY: 100, altKey: true })); });
    await act(async () => { window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Shift", altKey: true })); });
    const locked = state.preview.mock.lastCall![0] as Composition;
    expect(locked.items[0].placement!.y).toBe(50);
    await act(async () => { window.dispatchEvent(new window.KeyboardEvent("keyup", { key: "Shift", altKey: true })); });
    const free = state.preview.mock.lastCall![0] as Composition;
    expect(free.items[0].placement!.y).toBeCloseTo(50 + 4 / 192 * 100, 8);
    await act(async () => { window.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 4, clientX: 74, clientY: 100, altKey: true })); });
    expect(state.change).toHaveBeenCalledOnce();
  });

  it("seleciona a occurrence visível acima, mesmo quando a caixa selecionada pertence à principal", async () => {
    const value = fixture("cover");
    value.tracks.push({ ...value.tracks[0], id: "V2", primary: false });
    value.items.push({ ...structuredClone(value.items[0]), id: "overlay", trackId: "V2", groupId: "overlay", placement: { x: 75, y: 50, scale: 0.5, opacity: 1 } });
    const state = await setup(value, "placement"), select = vi.fn();
    await mounted!.render(<Canvas {...state.props} selectedId="visual" onSelect={select}/>);
    await state.down(80, 96);
    expect(select).toHaveBeenLastCalledWith("overlay");
    await mounted!.render(<Canvas {...state.props} selectedId="overlay" onSelect={select}/>);
    await act(async () => { window.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 4, clientX: 90, clientY: 96, altKey: true })); });
    const changed = state.change.mock.calls[0][0] as Composition;
    expect(changed.items[0]).toEqual(value.items[0]);
    expect(changed.items[1].placement!.x).toBeCloseTo(75 + 10 / 108 * 100, 8);
  });

  it("seleciona a mídia sem seleção anterior e um clique simples não altera a montagem", async () => {
    const state = await setup(fixture(), "placement"), select = vi.fn();
    await mounted!.render(<Canvas {...state.props} selectedId={null} onSelect={select}/>);
    await state.down(); await state.up(54, 96);
    expect(select).toHaveBeenLastCalledWith("visual");
    expect(state.change).not.toHaveBeenCalled();
  });

  it.each(["hidden", "transparent", "outside"])("não escolhe a sobreposição %s no ponto da mídia principal", async reason => {
    const value = fixture("cover");
    value.tracks.push({ ...value.tracks[0], id: "V2", primary: false, hidden: reason === "hidden" });
    value.items.push({ ...structuredClone(value.items[0]), id: "overlay", trackId: "V2", groupId: "overlay", startFrame: reason === "outside" ? 60 : 0, placement: { x: 50, y: 50, scale: 0.5, opacity: reason === "transparent" ? 0 : 1 } });
    const state = await setup(value, "placement"), select = vi.fn();
    await mounted!.render(<Canvas {...state.props} selectedId={null} onSelect={select}/>);
    await state.down(); await state.up(54, 96);
    expect(select).toHaveBeenLastCalledWith("visual");
    expect(state.change).not.toHaveBeenCalled();
  });

  it("permite selecionar para inspecionar a camada bloqueada sem iniciar transformação", async () => {
    const value = fixture("cover"); value.tracks[0].locked = true;
    const state = await setup(value, "placement"), select = vi.fn();
    await mounted!.render(<Canvas {...state.props} selectedId={null} onSelect={select}/>);
    await state.down(); await state.up(70, 96);
    expect(select).toHaveBeenLastCalledWith("visual");
    expect(state.change).not.toHaveBeenCalled();
    expect(state.pause).not.toHaveBeenCalled();
  });
});
