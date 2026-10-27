import { act, useLayoutEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionStage } from "../components/editor/CompositionStage";
import { useCompositionPlayback } from "../hooks/useCompositionPlayback";
import { compositionDuration } from "../lib/composition";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
import { reactHost } from "./react-host";

vi.mock("../lib/frame-seeker", () => ({ FrameSeeker: class { getFrameAt() { return Promise.resolve(null); } dispose() {} } }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let playback: ReturnType<typeof useCompositionPlayback>;
let now = 0;
let nextRequest = 0;
const requests = new Map<number, FrameRequestCallback>();
const media = { source: { url: "source.mp4", error: null }, image: { url: "image.png", error: null }, audio: { url: "tail.mp3", error: null } };

afterEach(async () => { await mounted?.close(); mounted = undefined; requests.clear(); vi.unstubAllGlobals(); });

function fixture(tail = true, gap = 0): Composition {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 42.459, width: 1920, height: 1080, videoId: null, url: null };
  const document = compositionFromLegacy(workspace, { fps: 30 });
  if (tail) {
    document.assets.push(
      { id: "image", mediaId: "image", name: "Final.png", kind: "image", durationUs: 0, width: 1080, height: 1920, transcript: [] },
      { id: "audio", mediaId: "audio", name: "Final.mp3", kind: "audio", durationUs: 3_540_000, width: 0, height: 0, transcript: [] },
    );
    const base = document.items[0];
    document.items.push(
      { ...structuredClone(base), id: "tail-image", assetId: "image", kind: "image", startFrame: 1274 + gap, durationFrames: 106, sourceStartUs: 0, sourceEndUs: 0, groupId: "tail" },
      { ...structuredClone(base), id: "tail-audio", assetId: "audio", trackId: "A1", kind: "audio", startFrame: 1274 + gap, durationFrames: 106, sourceStartUs: 0, sourceEndUs: 3_540_000, groupId: "tail" },
    );
  }
  return document;
}

function Probe({ document }: { document: Composition }) {
  const [ready, setReady] = useState(true);
  const value = useCompositionPlayback(document.fps, compositionDuration(document), ready);
  useLayoutEffect(() => { playback = value; }, [value]);
  return <CompositionStage document={document} frame={value.frame} playing={value.playing} media={media} onReady={setReady} onError={vi.fn()}/>;
}

async function mount(document = fixture()) {
  now = 0;
  vi.stubGlobal("performance", { now: () => now });
  mounted = await reactHost(<Probe document={document}/>, environment => {
    Object.defineProperty(environment, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => { requests.set(++nextRequest, callback); return nextRequest; } });
    Object.defineProperty(environment, "cancelAnimationFrame", { configurable: true, value: (id: number) => { requests.delete(id); } });
    for (const [name, getter] of Object.entries({
      readyState: function (this: HTMLElement) { return Number(this.dataset.ready ?? 4); },
      seeking: function (this: HTMLElement) { return this.dataset.seeking === "true"; },
      ended: function (this: HTMLElement) { return this.dataset.ended === "true"; },
      paused: function (this: HTMLElement) { return this.dataset.paused !== "false"; },
      duration: function (this: HTMLMediaElement) { return this.src.endsWith("source.mp4") ? 42.459 : 3.54; },
    })) Object.defineProperty(environment.HTMLMediaElement.prototype, name, { configurable: true, get: getter });
    environment.HTMLMediaElement.prototype.play = vi.fn(async function (this: HTMLElement) { this.dataset.paused = "false"; });
    environment.HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLElement) { this.dataset.paused = "true"; });
    environment.HTMLMediaElement.prototype.load = vi.fn();
    Object.defineProperty(environment.HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
    Object.defineProperty(environment.HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 512 });
  });
}

async function advance(ms: number) {
  now += ms;
  await act(async () => { const pending = [...requests.values()]; requests.clear(); pending.forEach(callback => callback(now)); });
}

async function finishVideo() {
  const video = mounted!.host.querySelector("video")!;
  await act(async () => {
    video.currentTime = 42.459;
    video.dataset.ready = "2";
    video.dataset.ended = "true";
    video.dataset.paused = "true";
    video.dispatchEvent(new window.Event("waiting"));
    video.dispatchEvent(new window.Event("pause"));
    video.dispatchEvent(new window.Event("ended"));
  });
  return video;
}

describe("reprodução além do fim físico da fonte", () => {
  it("atravessa EOF arredondado do vídeo e reproduz imagem e áudio até o fim da montagem", async () => {
    await mount();
    await act(async () => { playback.seek(1273); playback.toggle(); });
    await finishVideo();
    await advance(100);
    expect(playback.frame).toBeGreaterThanOrEqual(1274);
    expect(playback.buffering).toBe(false);
    expect(mounted!.host.querySelector("video")).toBeNull();
    expect(mounted!.host.querySelector("img")?.getAttribute("alt")).toBe("Final.png");
    expect(mounted!.host.querySelector("audio")?.paused).toBe(false);
    await advance(4000);
    expect(playback.frame).toBe(1380);
    expect(playback.playing).toBe(false);
  });

  it("continua pelas lacunas sem fontes até a próxima imagem e áudio", async () => {
    await mount(fixture(true, 60));
    await act(async () => { playback.seek(1273); playback.toggle(); });
    await finishVideo();
    await advance(100);
    expect(playback.buffering).toBe(false);
    expect(mounted!.host.querySelector("video, img, audio")).toBeNull();
    await advance(2100);
    expect(mounted!.host.querySelector("audio")?.paused).toBe(false);
    await advance(4000);
    expect(playback.frame).toBe(1440);
    expect(playback.playing).toBe(false);
  });

  it("encerra o último vídeo sem cauda e permite reproduzir novamente desde o início", async () => {
    await mount(fixture(false));
    await act(async () => { playback.seek(1273); playback.toggle(); });
    await finishVideo();
    await advance(100);
    expect(playback.frame).toBe(1274);
    expect(playback.playing).toBe(false);
    await act(async () => playback.toggle());
    expect(playback.frame).toBe(0);
    expect(mounted!.host.querySelector("video")?.paused).toBe(false);
  });

  it("waiting no meio do vídeo congela e só retoma quando a fonte volta a ficar pronta", async () => {
    await mount();
    await act(async () => { playback.seek(600); playback.toggle(); });
    const video = mounted!.host.querySelector("video")!;
    await act(async () => { video.dataset.ready = "2"; video.dispatchEvent(new window.Event("waiting")); });
    await advance(1000);
    expect(playback.frame).toBe(600);
    expect(playback.buffering).toBe(true);
    await act(async () => { video.dataset.ready = "4"; video.dispatchEvent(new window.Event("canplay")); });
    await advance(1000);
    expect(playback.frame).toBe(630);
    expect(playback.buffering).toBe(false);
  });

  it("seek anterior ao EOF volta à fonte e aguarda a busca antes de retomar", async () => {
    await mount();
    await act(async () => { playback.seek(1273); playback.toggle(); });
    const video = await finishVideo();
    await act(async () => {
      video.dataset.ended = "false";
      video.dataset.seeking = "true";
      video.dispatchEvent(new window.Event("seeking"));
      playback.seek(600);
    });
    expect(video.currentTime).toBe(20);
    await advance(1000);
    expect(playback.frame).toBe(600);
    expect(playback.buffering).toBe(true);
    await act(async () => { video.dataset.ready = "4"; video.dataset.seeking = "false"; video.dispatchEvent(new window.Event("seeked")); });
    await advance(1000);
    expect(playback.frame).toBe(630);
    expect(video.paused).toBe(false);
  });

  it("EOF do áudio final também libera a fração de frame restante sem repetir o áudio", async () => {
    await mount();
    await act(async () => { playback.seek(1379); playback.toggle(); });
    const audio = mounted!.host.querySelector("audio")!;
    await act(async () => {
      audio.currentTime = 3.54;
      audio.dataset.ready = "2";
      audio.dataset.ended = "true";
      audio.dataset.paused = "true";
      audio.dispatchEvent(new window.Event("waiting"));
      audio.dispatchEvent(new window.Event("ended"));
    });
    expect(audio.paused).toBe(true);
    await advance(100);
    expect(playback.frame).toBe(1380);
    expect(playback.playing).toBe(false);
  });

  it("erro da fonte não é convertido em EOF pronto", async () => {
    await mount();
    await act(async () => { playback.seek(1273); playback.toggle(); });
    const video = mounted!.host.querySelector("video")!;
    await act(async () => { video.dispatchEvent(new window.Event("error")); });
    await finishVideo();
    await advance(1000);
    expect(playback.frame).toBe(1273);
    expect(playback.buffering).toBe(true);
  });
});
