import { act, useRef } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { CompositionPreviewViewport } from "../components/editor/CompositionPreviewViewport";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";
import type { CompositionSnapGuides } from "../lib/composition-preview-snap";

const environment = await vi.hoisted(async () => {
  const { Window } = await import("happy-dom");
  const value = new Window({ url: "http://localhost" });
  vi.stubGlobal("window", value); vi.stubGlobal("document", value.document);
  return value;
});
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.restoreAllMocks(); });
afterAll(async () => { await environment.happyDOM.cancelAsync(); vi.unstubAllGlobals(); });

const composition = compositionFromLegacy(emptyWorkspace());
const navigate = vi.fn(), pointer = vi.fn(), deselect = vi.fn();
function wheelEvent(options: WheelEventInit) {
  const event = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, ...options });
  Object.defineProperties(event, { ctrlKey: { value: Boolean(options.ctrlKey) }, clientX: { value: options.clientX ?? 0 }, clientY: { value: options.clientY ?? 0 } });
  return event;
}
function Fixture({ guides }: { guides?: CompositionSnapGuides }) {
  const canvas = useRef<HTMLDivElement>(null);
  return <CompositionPreviewViewport document={composition} frame={0} canvasRef={canvas} framing={false} snapGuides={guides} onPointerDown={pointer} onViewChange={navigate} onDeselect={deselect}>
    <div className="composition-stage"><video /></div>
  </CompositionPreviewViewport>;
}
async function open() {
  mounted = await reactHost(<Fixture />);
  const canvas = mounted.host.querySelector<HTMLElement>(".composition-editor__canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
  await act(async () => { window.dispatchEvent(new window.Event("resize")); });
  return canvas;
}

describe("navegação da visualização do editor", () => {
  it("limpa a seleção ao clicar na área vazia, mas não no vídeo ou nos controles", async () => {
    const canvas = await open();
    deselect.mockClear();
    await act(async () => { canvas.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 10, clientY: 10, bubbles: true })); });
    expect(deselect).toHaveBeenCalledOnce();
    deselect.mockClear();
    await act(async () => { mounted!.host.querySelector("video")!.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, bubbles: true })); });
    await mounted!.click("Ampliar prévia");
    expect(deselect).not.toHaveBeenCalled();
  });
  it("Ctrl+roda amplia sem substituir o player e Ajustar restaura a visualização", async () => {
    const canvas = await open(), video = mounted!.host.querySelector("video");
    const ordinary = wheelEvent({ deltaY: -600 });
    await act(async () => { canvas.dispatchEvent(ordinary); });
    expect(ordinary.defaultPrevented).toBe(false);
    expect(canvas.dataset.previewZoom).toBe("1");
    const wheel = wheelEvent({ ctrlKey: true, deltaY: -600, clientX: 400, clientY: 300 });
    await act(async () => { canvas.dispatchEvent(wheel); });
    expect(wheel.defaultPrevented).toBe(true);
    expect(Number(canvas.dataset.previewZoom)).toBeGreaterThan(1);
    expect(mounted!.host.querySelector("video")).toBe(video);
    expect(mounted!.host.querySelector('[aria-label="Navegar na prévia ampliada"]')).not.toBeNull();
    await mounted!.click("Ajustar prévia à janela");
    expect(canvas.dataset.previewZoom).toBe("1");
    expect(mounted!.host.querySelector('[aria-label="Navegar na prévia ampliada"]')).toBeNull();
  });

  it("limita rodas extremas e não deixa os controles dentro do elemento transformado", async () => {
    const canvas = await open();
    await act(async () => { canvas.dispatchEvent(wheelEvent({ ctrlKey: true, deltaY: -1e9 })); });
    expect(canvas.dataset.previewZoom).toBe("4");
    expect(mounted!.host.querySelector(".composition-preview__camera button")).toBeNull();
    await act(async () => { canvas.dispatchEvent(wheelEvent({ ctrlKey: true, deltaY: 1e9 })); });
    expect(canvas.dataset.previewZoom).toBe("0.25");
  });

  it("navega pela miniatura sem iniciar arraste do objeto e aceita navegação por teclado", async () => {
    await open();
    await mounted!.click("Ampliar prévia");
    const overview = mounted!.host.querySelector<HTMLElement>('[aria-label="Navegar na prévia ampliada"]')!;
    vi.spyOn(overview, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 56 } as DOMRect);
    pointer.mockClear();
    await act(async () => {
      overview.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 95, clientY: 28, bubbles: true }));
      window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 95, clientY: 28 }));
    });
    expect(pointer).not.toHaveBeenCalled();
    const camera = mounted!.host.querySelector<HTMLElement>(".composition-preview__camera")!;
    expect(camera.style.transform).toContain("translate(-");
    await act(async () => { overview.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
    expect(mounted!.host.querySelector<HTMLElement>(".composition-editor__canvas")!.dataset.previewZoom).toBe("1");
    expect(navigate).toHaveBeenCalled();
  });

  it("cancela pan com Escape e devolve a seleção após reduzir até Ajustar", async () => {
    const canvas = await open();
    await mounted!.click("Ampliar prévia");
    await mounted!.click("Mover visualização da prévia");
    const camera = mounted!.host.querySelector<HTMLElement>(".composition-preview__camera")!;
    const before = camera.style.transform;
    await act(async () => {
      canvas.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 400, clientY: 300, bubbles: true }));
      window.dispatchEvent(new window.MouseEvent("pointermove", { clientX: 450, clientY: 300 }));
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 450, clientY: 300 }));
    });
    expect(camera.style.transform).toBe(before);
    await mounted!.click("Reduzir prévia");
    expect(canvas.dataset.pan).toBe("false");
    pointer.mockClear();
    await act(async () => { mounted!.host.querySelector("video")!.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, bubbles: true })); });
    expect(pointer).toHaveBeenCalledOnce();
  });

  it("remove o listener de roda ao sair do editor", async () => {
    const canvas = await open();
    const event = wheelEvent({ ctrlKey: true, deltaY: -100 });
    await mounted!.close(); mounted = undefined;
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("apresenta guias transitórias alinhadas ao quadro e as remove sem trocar o player", async () => {
    await open();
    const video = mounted!.host.querySelector("video");
    await mounted!.render(<Fixture guides={{ x: 960, y: 1080 }}/>);
    const guide = mounted!.host.querySelector<HTMLElement>(".composition-preview__guides")!;
    expect(guide.getAttribute("aria-hidden")).toBe("true");
    expect(guide.querySelector<HTMLElement>(".composition-preview__guide-x")!.style.left).toBe("50%");
    expect(guide.querySelector<HTMLElement>(".composition-preview__guide-y")!.style.top).toBe("100%");
    expect(guide.querySelector("button,input,a")).toBeNull();
    await mounted!.render(<Fixture/>);
    expect(mounted!.host.querySelector(".composition-preview__guides")).toBeNull();
    expect(mounted!.host.querySelector("video")).toBe(video);
  });
});
