import { act, useRef } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { CompositionSelection } from "../components/editor/CompositionSelection";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
import { reactHost } from "./react-host";

const bootstrap = await vi.hoisted(async () => {
  const { Window } = await import("happy-dom");
  const value = new Window({ url: "http://localhost" });
  vi.stubGlobal("window", value); vi.stubGlobal("document", value.document);
  return value;
});
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.restoreAllMocks(); });
afterAll(async () => { await bootstrap.happyDOM.cancelAsync(); vi.unstubAllGlobals(); });

function fixture(): Composition {
  const value = compositionFromLegacy(emptyWorkspace()); value.settings.ratio = "9:16";
  value.assets = [{ id: "source", mediaId: "source", name: "Original.mp4", kind: "video", width: 1920, height: 1080, durationUs: 2e6, transcript: [] }];
  value.tracks = [{ id: "V1", name: "Principal", kind: "visual", primary: true, hidden: false, locked: false, muted: false }];
  value.items = [{ id: "item", assetId: "source", trackId: "V1", kind: "video", startFrame: 0, durationFrames: 60, sourceStartUs: 0, sourceEndUs: 2e6,
    groupId: "item", followsMain: true, settings: { ...value.settings, fit: "contain", focalPoint: { x: 50, y: 50 } }, captionEdits: {}, placement: { x: 50, y: 50, scale: 0.5, opacity: 1 } }];
  return value;
}

function Canvas({ value, frame = 0, selected = true, disabled = false, pointer }: { value: Composition; frame?: number; selected?: boolean; disabled?: boolean; pointer: ReturnType<typeof vi.fn> }) {
  const ref = useRef<HTMLDivElement>(null);
  return <div ref={ref} data-container><div className="composition-stage" /><CompositionSelection document={value} item={selected ? value.items[0] : undefined} frame={frame} containerRef={ref} disabled={disabled} onPointerDown={pointer} /></div>;
}
async function prepare(value = fixture()) {
  const pointer = vi.fn(); mounted = await reactHost(<Canvas value={value} pointer={pointer} />);
  vi.spyOn(mounted.host.querySelector<HTMLElement>("[data-container]")!, "getBoundingClientRect").mockReturnValue({ left: 10, top: 10, width: 300, height: 220 } as DOMRect);
  const bounds = vi.spyOn(mounted.host.querySelector<HTMLElement>(".composition-stage")!, "getBoundingClientRect").mockReturnValue({ left: 20, top: 30, width: 108, height: 192 } as DOMRect);
  await act(async () => { window.dispatchEvent(new window.Event("resize")); });
  return { value, pointer, bounds };
}

describe("caixa e alças da mídia selecionada", () => {
  it("encaixa na mídia contain efetiva e mantém quatro alças na principal", async () => {
    await prepare();
    const box = mounted!.host.querySelector<HTMLElement>(".composition-selection")!;
    expect(Number.parseFloat(box.style.left)).toBeCloseTo(37, 8);
    expect(Number.parseFloat(box.style.top)).toBeCloseTo(100.8, 8);
    expect(Number.parseFloat(box.style.width)).toBeCloseTo(54, 8);
    expect(Number.parseFloat(box.style.height)).toBeCloseTo(30.4, 8);
    expect(box.querySelectorAll("[data-corner]")).toHaveLength(4);
    expect(box.getAttribute("aria-hidden")).toBe("true");
    expect(box.querySelectorAll("button,[role=button],video,canvas")).toHaveLength(0);
  });

  it("encaminha o canto exato uma vez e não inicia move junto", async () => {
    const { pointer } = await prepare();
    await act(async () => { mounted!.host.querySelector('[data-corner="se"]')!.dispatchEvent(new window.PointerEvent("pointerdown", { button: 0, bubbles: true })); });
    expect(pointer).toHaveBeenCalledOnce();
    expect(pointer.mock.calls[0][1]).toBe("se");
  });

  it.each(["unselected", "locked", "hidden", "outside", "disabled"])("oculta a caixa quando %s", async reason => {
    const { value, pointer } = await prepare();
    const next = { ...value, tracks: value.tracks.map(track => ({ ...track, locked: reason === "locked", hidden: reason === "hidden" })) };
    await mounted!.render(<Canvas value={next} selected={reason !== "unselected"} disabled={reason === "disabled"} frame={reason === "outside" ? 60 : 0} pointer={pointer} />);
    expect(mounted!.host.querySelector(".composition-selection")).toBeNull();
  });

  it("recalcula a posição quando o viewport é redimensionado", async () => {
    const { bounds } = await prepare();
    bounds.mockReturnValue({ left: 40, top: 50, width: 216, height: 384 } as DOMRect);
    await act(async () => { window.dispatchEvent(new window.Event("resize")); });
    const box = mounted!.host.querySelector<HTMLElement>(".composition-selection")!;
    expect(Number.parseFloat(box.style.left)).toBeCloseTo(84, 8);
    expect(Number.parseFloat(box.style.top)).toBeCloseTo(201.6, 8);
  });
});
