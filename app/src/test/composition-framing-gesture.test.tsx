import { act, useRef } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionFraming } from "../components/editor/useCompositionFraming";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { visualContentStyle } from "../lib/composition-placement";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
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

interface CanvasProps { value: Composition; mode?: "crop" | "placement"; frame?: number; playing?: boolean; preview: (value: Composition | null) => void; change: (value: Composition) => void; pause: () => void; error: (message: string) => void }
function Canvas({ value, mode = "crop", frame = 0, playing = false, preview, change, pause, error }: CanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const pointer = useCompositionFraming({ document: value, item: value.items[0], time: 0, frame, playing, onPause: pause, stageRef: container, enabled: true, mode, onPreview: preview, onChange: change, onError: error });
  return <div ref={container} onPointerDown={pointer}><div className="composition-stage"><div data-composition-layer="visual"><img alt="Original" /></div></div>
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
});
