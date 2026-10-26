import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VideoPreview } from "../components/workspace/VideoPreview";
import { defaultEditorSettings } from "../lib/workspace";
import { defaultSplitScreen } from "../lib/split-screen";
import { reactHost } from "./react-host";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 3));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

it("desliga os dois painéis ao entrar num close e os recompõe ao voltar", async () => {
  const drawImage = vi.fn();
  const clearRect = vi.fn();
  const pair = defaultSplitScreen();
  const view = await reactHost(<VideoPreview media={null} localUrl="test.mp4" nativeControls={false}
    settings={{ ...defaultEditorSettings(), ratio: "9:16", splitScreen: { ...pair, faceValidated: true,
      shots: [{ sourceStart: 0, sourceEnd: 10, top: pair.top, bottom: pair.bottom }] } }}/>, environment => {
    Object.defineProperty(environment.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ clearRect, drawImage }) });
    for (const [key, value] of Object.entries({ videoWidth: 1920, videoHeight: 1080, readyState: 2 })) {
      Object.defineProperty(environment.HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
    }
  });
  const video = view.host.querySelector("video")!;
  expect(drawImage).toHaveBeenCalledTimes(2);
  video.currentTime = 15;
  await act(async () => video.dispatchEvent(new window.Event("seeked")));
  expect(drawImage).toHaveBeenCalledTimes(2);
  expect(view.host.querySelector(".split-preview")?.getAttribute("data-mode")).toBe("single");
  video.currentTime = 5;
  await act(async () => video.dispatchEvent(new window.Event("seeked")));
  expect(drawImage).toHaveBeenCalledTimes(4);
  expect(view.host.querySelector(".split-preview")?.getAttribute("data-mode")).toBe("split");
  await view.close();
});

it("resolve a cena pelo instante do frame apresentado durante a reprodução", async () => {
  const drawImage = vi.fn();
  let callback: VideoFrameRequestCallback | undefined;
  const pair = defaultSplitScreen();
  const view = await reactHost(<VideoPreview media={null} localUrl="test.mp4" nativeControls={false}
    settings={{ ...defaultEditorSettings(), ratio: "9:16", splitScreen: { ...pair, faceValidated: true,
      shots: [{ sourceStart: 0, sourceEnd: 10, top: pair.top, bottom: pair.bottom }] } }}/>, environment => {
    Object.defineProperty(environment.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ clearRect: vi.fn(), drawImage }) });
    for (const [key, value] of Object.entries({ videoWidth: 1920, videoHeight: 1080, readyState: 2, paused: false })) {
      Object.defineProperty(environment.HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
    }
    Object.defineProperty(environment.HTMLVideoElement.prototype, "requestVideoFrameCallback", { configurable: true, value: (next: VideoFrameRequestCallback) => { callback = next; return 2; } });
    Object.defineProperty(environment.HTMLVideoElement.prototype, "cancelVideoFrameCallback", { configurable: true, value: vi.fn() });
  });
  view.host.querySelector("video")!.currentTime = 15;
  await act(async () => callback?.(0, { mediaTime: 7 } as VideoFrameCallbackMetadata));
  expect(drawImage).toHaveBeenCalledTimes(4);
  await view.close();
});

it("não duplica uma pessoa com um preset antigo ainda sem validação de rostos", async () => {
  const view = await reactHost(<VideoPreview media={null} localUrl="test.mp4" nativeControls={false}
    settings={{ ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen() }}/>);
  expect(view.host.querySelector(".split-preview")).toBeNull();
  expect(view.host.querySelector(".workspace-preview")?.getAttribute("data-split")).toBe("false");
  await view.close();
});

it("compõe dois painéis a partir de um único vídeo e atualiza ao buscar", async () => {
  const drawImage = vi.fn();
  const view = await reactHost(<VideoPreview media={null} localUrl="test.mp4" nativeControls={false}
    settings={{ ...defaultEditorSettings(), ratio: "9:16", splitScreen: { ...defaultSplitScreen(), faceValidated: true } }}/>, environment => {
    vi.stubGlobal("Event", environment.Event);
    Object.defineProperty(environment.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ clearRect: vi.fn(), drawImage }) });
    for (const [key, value] of Object.entries({ videoWidth: 1920, videoHeight: 1080, readyState: 2 })) {
      Object.defineProperty(environment.HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
    }
  });
  expect(view.host.querySelectorAll("video")).toHaveLength(1);
  expect(view.host.querySelectorAll("canvas")).toHaveLength(1);
  expect(drawImage).toHaveBeenCalledTimes(2);
  expect(drawImage.mock.calls[0][1]).toBe(0);
  expect(drawImage.mock.calls[1][1]).toBeGreaterThan(0);
  const video = view.host.querySelector("video")!;
  await act(async () => video.dispatchEvent(new Event("seeked")));
  expect(drawImage).toHaveBeenCalledTimes(4);
  await view.close();
});

it("não transforma a comparação original e libera callback de frame ao desmontar", async () => {
  const request = vi.fn(() => 71);
  const cancel = vi.fn();
  const drawImage = vi.fn();
  const settings = { ...defaultEditorSettings(), ratio: "9:16" as const, splitScreen: { ...defaultSplitScreen(), faceValidated: true } };
  const view = await reactHost(<VideoPreview media={null} localUrl="test.mp4" nativeControls={false} settings={settings}/>, environment => {
    Object.defineProperty(environment.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ clearRect: vi.fn(), drawImage }) });
    for (const [key, value] of Object.entries({ videoWidth: 1920, videoHeight: 1080, readyState: 2, paused: false })) {
      Object.defineProperty(environment.HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
    }
    Object.defineProperty(environment.HTMLVideoElement.prototype, "requestVideoFrameCallback", { configurable: true, value: request });
    Object.defineProperty(environment.HTMLVideoElement.prototype, "cancelVideoFrameCallback", { configurable: true, value: cancel });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 3));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  expect(request).toHaveBeenCalledTimes(1);
  await view.render(<VideoPreview media={null} localUrl="test.mp4" nativeControls={false} settings={settings} original/>);
  expect(view.host.querySelectorAll("canvas")).toHaveLength(0);
  expect(cancel).toHaveBeenCalledWith(71);
  await view.close();
});
