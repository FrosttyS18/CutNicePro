import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionStage } from "../components/editor/CompositionStage";
import { parseComposition } from "../lib/composition-boundary";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });

function fixture() {
  const document = compositionFromLegacy(emptyWorkspace());
  document.settings.ratio = "9:16";
  document.assets = [{ id: "image", mediaId: "image", name: "Marca.png", kind: "image", durationUs: 0, width: 1920, height: 1080, transcript: [] }];
  document.tracks.push({ id: "overlay", name: "Sobreposição", kind: "visual", primary: false, hidden: false, locked: false, muted: false });
  document.items = [{ id: "logo", assetId: "image", trackId: "overlay", kind: "image", groupId: "logo", followsMain: false,
    startFrame: 0, durationFrames: 300, sourceStartUs: 0, sourceEndUs: 0, settings: { ...document.settings, fit: "contain", zoom: 1.5, focalPoint: { x: 25, y: 75 } }, captionEdits: {} }];
  return document;
}

describe("posicionamento da sobreposição", () => {
  it("preserva o contrato legado sem placement e rejeita valores fora do contrato", () => {
    const document = fixture();
    expect(parseComposition(document)).toEqual(document);
    for (const placement of [null, {}, { x: 50, y: 50, scale: 0, opacity: 1 }, { x: 101, y: 50, scale: 1, opacity: 1 },
      { x: 50, y: -1, scale: 1, opacity: 1 }, { x: 50, y: 50, scale: 2.1, opacity: 1 }, { x: 50, y: 50, scale: 1, opacity: 1.1 },
      { x: Number.NaN, y: 50, scale: 1, opacity: 1 }, { x: 50, y: 50, scale: 1, opacity: Number.POSITIVE_INFINITY }]) {
      expect(() => parseComposition({ ...document, items: [{ ...document.items[0], placement }] })).toThrow(/montagem/i);
    }
  });

  it("mantém centro, escala uniforme e opacidade na camada completa", async () => {
    const document = fixture();
    const value = { ...document, items: [{ ...document.items[0], placement: { x: 75, y: 25, scale: 0.4, opacity: 0.6 } }] };
    mounted = await reactHost(<CompositionStage document={value} frame={0} playing={false} media={{ image: { url: "image.png", error: null } }} onError={vi.fn()} />);
    const layer = mounted.host.querySelector<HTMLElement>(".composition-stage__layer")!;
    expect(layer.style.left).toBe("75%");
    expect(layer.style.top).toBe("25%");
    expect(layer.style.transform).toBe("translate(-50%, -50%) scale(0.4)");
    expect(layer.style.opacity).toBe("0.6");
  });

  it("usa zoom e âncora focal da geometria exportada para imagens sem preencher as margens", async () => {
    mounted = await reactHost(<CompositionStage document={fixture()} frame={0} playing={false} media={{ image: { url: "image.png", error: null } }} onError={vi.fn()} />);
    const image = mounted.host.querySelector<HTMLImageElement>(".composition-stage__image")!;
    expect(image.style.width).toBe("150%");
    expect(parseFloat(image.style.height)).toBeCloseTo(910 / 1920 * 100, 8);
    expect(image.style.left).toBe("-12.5%");
    expect(parseFloat(image.style.top)).toBeCloseTo(757 / 1920 * 100, 8);
    expect(image.parentElement!.style.background).not.toBe("rgb(0, 0, 0)");
  });

  it("mantém proporção original da primeira mídia visual ao adicionar outra imagem", async () => {
    const document = fixture();
    document.settings.ratio = "original";
    document.assets[0].width = 1000;
    document.assets[0].height = 1500;
    mounted = await reactHost(<CompositionStage document={document} frame={0} playing={false} media={{ image: { url: "image.png", error: null } }} onError={vi.fn()} />);
    expect(parseFloat(mounted.host.querySelector<HTMLElement>(".composition-stage")!.style.aspectRatio)).toBeCloseTo(2 / 3);
  });
});
