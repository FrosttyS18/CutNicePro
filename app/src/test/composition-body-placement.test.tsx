import { act } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { CompositionEditorBody } from "../components/editor/CompositionEditorBody";
import { compositionFromLegacy } from "../lib/composition-legacy";
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

vi.mock("../hooks/useCompositionMedia", () => ({ useCompositionMedia: () => ({ image: { url: "image.png", error: null } }) }));
vi.mock("../hooks/useTimelinePreview", () => ({ useTimelinePreview: () => ({ frames: [], peaks: [], error: null }) }));
vi.mock("../components/editor/CompositionSource", () => ({ CompositionSource: () => null }));
vi.mock("../components/editor/CompositionStage", () => ({ CompositionStage: ({ document }: { document: Composition }) => <div className="composition-stage">{document.items.filter(item => item.kind === "video" || item.kind === "image").map(item => <div key={item.id} data-composition-layer={item.id}><img alt={item.id}/></div>)}</div> }));
vi.mock("../components/workspace/TranscriptPanel", () => ({ TranscriptPanel: ({ currentTime }: { currentTime: number }) => <output data-transcript-time={currentTime}>{currentTime}</output> }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.useRealTimers(); vi.clearAllMocks(); });
afterAll(async () => { await bootstrap.happyDOM.cancelAsync(); vi.unstubAllGlobals(); });

function fixture() {
  const document = compositionFromLegacy(emptyWorkspace());
  document.assets = [{ id: "image", mediaId: "image", name: "Marca.png", kind: "image", durationUs: 0, width: 1920, height: 1080, transcript: [] }];
  document.tracks.push({ id: "overlay", name: "Sobreposição", kind: "visual", primary: false, hidden: false, locked: false, muted: false });
  document.items = [{ id: "logo", assetId: "image", trackId: "overlay", kind: "image", groupId: "logo", followsMain: false,
    startFrame: 0, durationFrames: 300, sourceStartUs: 0, sourceEndUs: 0, settings: { ...document.settings }, captionEdits: {} }];
  return document;
}

function editor(document: Composition, change = vi.fn(), preview = vi.fn(), frame = 0, error = vi.fn()) {
  return <CompositionEditorBody projectId="project" document={document} frame={frame} playing selected={["logo"]} sourceUrl={null}
    legacy={emptyWorkspace()} onChange={change} onPreview={preview} onSeek={vi.fn()} onPause={vi.fn()} onError={error} onPreviews={vi.fn()} />;
}

describe("controles e gesto de sobreposição", () => {
  it("seleciona pela prévia sem seleção da timeline e sem salvar ou reposicionar o cursor", async () => {
    const document = fixture(), select = vi.fn(), change = vi.fn(), seek = vi.fn();
    mounted = await reactHost(<CompositionEditorBody projectId="project" document={document} frame={0} playing={false} selected={[]} sourceUrl={null}
      legacy={emptyWorkspace()} onChange={change} onPreview={vi.fn()} onSeek={seek} onPause={vi.fn()} onError={vi.fn()} onPreviews={vi.fn()} onSelect={select}/>);
    const stage = mounted.host.querySelector<HTMLElement>(".composition-stage")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    await act(async () => {
      stage.querySelector("img")!.dispatchEvent(new window.PointerEvent("pointerdown", { button: 0, clientX: 200, clientY: 100, pointerId: 4, bubbles: true }));
      window.dispatchEvent(new window.PointerEvent("pointerup", { clientX: 200, clientY: 100, pointerId: 4 }));
    });
    expect(select).toHaveBeenCalledWith("logo");
    expect(change).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();
  });

  it.each([true, false])("a margem do wrapper superior escolhe a mídia inferior (%s) antes de decidir desseleção", async hasBase => {
    const document = fixture(), select = vi.fn(), clear = vi.fn(), change = vi.fn(), seek = vi.fn();
    document.items[0].placement = { x: 50, y: 50, scale: 0.4, opacity: 1 };
    if (hasBase) document.items.push({ ...structuredClone(document.items[0]), id: "base", trackId: "V1", groupId: "base", placement: { x: 50, y: 50, scale: 1, opacity: 1 } });
    mounted = await reactHost(<CompositionEditorBody projectId="project" document={document} frame={0} playing={false} selected={["logo"]} sourceUrl={null}
      legacy={emptyWorkspace()} onChange={change} onPreview={vi.fn()} onSeek={seek} onPause={vi.fn()} onError={vi.fn()} onPreviews={vi.fn()} onSelect={select} onClearSelection={clear}/>);
    const stage = mounted.host.querySelector<HTMLElement>(".composition-stage")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    await act(async () => {
      stage.querySelector('[data-composition-layer="logo"]')!.dispatchEvent(new window.PointerEvent("pointerdown", { button: 0, clientX: 20, clientY: 100, pointerId: 4, bubbles: true }));
      window.dispatchEvent(new window.PointerEvent("pointerup", { clientX: 20, clientY: 100, pointerId: 4 }));
    });
    if (hasBase) { expect(select).toHaveBeenLastCalledWith("base"); expect(clear).not.toHaveBeenCalled(); }
    else { expect(select).not.toHaveBeenCalled(); expect(clear).toHaveBeenCalledOnce(); }
    expect(change).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();
  });

  it("amplia a visualização sem salvar transformação ou criar alteração no rascunho", async () => {
    const document = fixture(), change = vi.fn(), preview = vi.fn();
    mounted = await reactHost(editor(document, change, preview));
    await mounted.click("Ampliar prévia");
    expect(change).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
    expect(document.items[0].placement).toBeUndefined();
    expect(mounted.host.querySelector<HTMLElement>(".composition-editor__canvas")!.dataset.previewZoom).toBe("1.25");
  });

  it("permite transformar a mídia selecionada também na faixa principal", async () => {
    const document = fixture();
    document.items[0].trackId = document.tracks.find(track => track.primary)!.id;
    const change = vi.fn();
    mounted = await reactHost(editor(document, change));
    await mounted.click("Enquadrar");
    const input = mounted.host.querySelector<HTMLInputElement>('[aria-label="Escala da mídia"]');
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, "60");
      input!.dispatchEvent(new window.Event("input", { bubbles: true }));
      input!.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
    });
    expect(change).toHaveBeenCalledOnce();
    const next = change.mock.calls[0][0] as Composition;
    expect(next.items[0].placement).toEqual({ x: 50, y: 50, scale: .6, opacity: 1 });
    expect(next.items[0].trackId).toBe(document.items[0].trackId);
    expect(next.items[0].settings).toEqual(document.items[0].settings);
    expect(next.assets).toBe(document.assets);
  });

  it("altera a escala da sobreposição sem alterar o enquadramento ou a mídia", async () => {
    const document = fixture();
    const change = vi.fn();
    mounted = await reactHost(editor(document, change));
    await mounted.click("Enquadrar");
    const input = mounted.host.querySelector<HTMLInputElement>('[aria-label="Escala da sobreposição"]');
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, "40");
      input!.dispatchEvent(new window.Event("input", { bubbles: true }));
      input!.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
    });
    const next = change.mock.calls[0][0] as Composition;
    expect(next.items[0].placement).toEqual({ x: 50, y: 50, scale: 0.4, opacity: 1 });
    expect(next.items[0].settings).toEqual(document.items[0].settings);
    expect(next.assets).toBe(document.assets);
  });

  it("arrasta somente o item visual selecionado e confirma uma vez com a última posição", async () => {
    const document = fixture();
    const change = vi.fn();
    const preview = vi.fn();
    mounted = await reactHost(editor(document, change, preview));
    const stage = mounted.host.querySelector<HTMLElement>(".composition-stage")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    await act(async () => {
      stage.querySelector("img")!.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 100, clientY: 100, bubbles: true }));
      window.dispatchEvent(new window.MouseEvent("pointermove", { clientX: 140, clientY: 110 }));
      window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 180, clientY: 120 }));
    });
    expect(change).toHaveBeenCalledOnce();
    expect((change.mock.calls[0][0] as Composition).items[0].placement).toEqual({ x: 70, y: 60, scale: 1, opacity: 1 });
    expect((change.mock.calls[0][0] as Composition).items[0].settings).toEqual(document.items[0].settings);
    expect(preview).toHaveBeenLastCalledWith(null);
  });

  it("recusa arrastar sobreposição de uma faixa bloqueada", async () => {
    const document = fixture();
    document.tracks.find(track => track.id === "overlay")!.locked = true;
    const error = vi.fn();
    const change = vi.fn();
    mounted = await reactHost(editor(document, change, vi.fn(), 0, error));
    const stage = mounted.host.querySelector<HTMLElement>(".composition-stage")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    await act(async () => {
      stage.querySelector("img")!.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, bubbles: true }));
    });
    expect(error).toHaveBeenCalledWith("A faixa selecionada está bloqueada");
    expect(change).not.toHaveBeenCalled();
  });
});

describe("transcrição durante reprodução contínua", () => {
  it("atualiza o tempo com frequência limitada sem aguardar o cursor parar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const legacy = emptyWorkspace();
    legacy.media = { kind: "local", mediaId: "source", name: "Entrevista.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
    legacy.transcript = [{ id: "speech", start: 0, end: 8, text: "Uma fala durante a reprodução.", words: [{ text: "Uma fala durante a reprodução.", start: 0, end: 8 }] }];
    const document = compositionFromLegacy(legacy, { fps: 30 });
    document.items.find(item => item.kind === "video")!.id = "logo";
    mounted = await reactHost(editor(document));
    await mounted.click("Transcrição");
    expect(mounted.host.querySelector("[data-transcript-time]")).not.toBeNull();
    for (const frame of [30, 60, 90, 120]) {
      await mounted.render(editor(document, vi.fn(), vi.fn(), frame));
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    }
    const time = Number(mounted.host.querySelector("[data-transcript-time]")!.getAttribute("data-transcript-time"));
    expect(time).toBeGreaterThan(0);
    expect(time).toBeLessThan(4);
    await act(async () => { await vi.advanceTimersByTimeAsync(120); });
    expect(Number(mounted.host.querySelector("[data-transcript-time]")!.getAttribute("data-transcript-time"))).toBe(4);
  });
});

describe("propriedades globais da montagem", () => {
  it("atualiza a chamada global mesmo com uma sobreposição bloqueada selecionada", async () => {
    const document = fixture();
    document.tracks.find(track => track.id === "overlay")!.locked = true;
    const change = vi.fn();
    mounted = await reactHost(editor(document, change));
    const textarea = mounted.host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), "value")!.set!.call(textarea, "Nova chamada");
      textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    expect(change).toHaveBeenCalledOnce();
    const next = change.mock.calls[0][0] as Composition;
    expect(next.settings.text).toBe("Nova chamada");
    expect(next.items).toBe(document.items);
  });

  it("atualiza o fundo global sem gravar um fundo ignorado na sobreposição", async () => {
    const document = fixture();
    const change = vi.fn();
    mounted = await reactHost(editor(document, change));
    await mounted.click("Enquadrar");
    const color = mounted.host.querySelector<HTMLInputElement>('[aria-label="Cor de fundo"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(color), "value")!.set!.call(color, "#112233");
      color.dispatchEvent(new window.Event("input", { bubbles: true }));
      color.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    expect(change).toHaveBeenCalledOnce();
    const next = change.mock.calls[0][0] as Composition;
    expect(next.settings.background).toBe("#112233");
    expect(next.items).toBe(document.items);
  });
});
