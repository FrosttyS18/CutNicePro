import { act, useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SplitPreview } from "../components/workspace/SplitPreview";
import { defaultSplitScreen } from "../lib/split-screen";
import type { ScrubCanvas } from "../lib/frame-seeker";
import type { SplitScreenSettings } from "../lib/workspace-types";
import { reactHost } from "./react-host";

const pair = defaultSplitScreen();
const layout: SplitScreenSettings = { ...pair, shots: [
  { sourceStart: 0, sourceEnd: 2, top: pair.top, bottom: pair.bottom },
  { sourceStart: 4, sourceEnd: 6, top: { ...pair.top, x: 50 }, bottom: pair.bottom },
] };
interface Props { scrub?: ScrubCanvas | null; scrubTime?: number; layout?: SplitScreenSettings; localUrl?: string }
function Fixture({ scrub, scrubTime, layout: currentLayout = layout, localUrl = "fixture.mp4" }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  return <><video ref={video} src={localUrl}/><SplitPreview video={video} layout={currentLayout} localUrl={localUrl} scrub={scrub} scrubTime={scrubTime}/></>;
}
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function mount({ paused = false, native = true } = {}) {
  const state = { time: 1, paused };
  const frames = new Map<number, VideoFrameRequestCallback>();
  const rafs = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const request = vi.fn((callback: VideoFrameRequestCallback) => { const id = ++sequence; frames.set(id, callback); return id; });
  const cancel = vi.fn((id: number) => { frames.delete(id); });
  const raf = vi.fn((callback: FrameRequestCallback) => { const id = ++sequence; rafs.set(id, callback); return id; });
  const cancelRaf = vi.fn((id: number) => { rafs.delete(id); });
  const draw = vi.fn(), clear = vi.fn();
  view = await reactHost(<Fixture scrubTime={1}/>, environment => {
    Object.defineProperty(environment.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ drawImage: draw, clearRect: clear }) });
    for (const [key, value] of Object.entries({ videoWidth: 1920, videoHeight: 1080, readyState: 2 })) {
      Object.defineProperty(environment.HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
    }
    Object.defineProperty(environment.HTMLVideoElement.prototype, "paused", { configurable: true, get: () => state.paused });
    Object.defineProperty(environment.HTMLVideoElement.prototype, "currentTime", { configurable: true, get: () => state.time, set: value => { state.time = value; } });
    Object.defineProperty(environment.HTMLVideoElement.prototype, "requestVideoFrameCallback", { configurable: true, value: native ? request : undefined });
    Object.defineProperty(environment.HTMLVideoElement.prototype, "cancelVideoFrameCallback", { configurable: true, value: cancel });
    vi.stubGlobal("requestAnimationFrame", raf); vi.stubGlobal("cancelAnimationFrame", cancelRaf);
  });
  const video = view.host.querySelector("video")!;
  const add = vi.spyOn(video, "addEventListener"), remove = vi.spyOn(video, "removeEventListener");
  const mode = () => view!.host.querySelector(".split-preview")?.getAttribute("data-mode");
  const nativeFrame = async (mediaTime: number) => {
    const [id, callback] = frames.entries().next().value!; frames.delete(id);
    await act(async () => callback(0, { mediaTime } as VideoFrameCallbackMetadata));
  };
  const fallbackFrame = async () => {
    const [id, callback] = rafs.entries().next().value!; rafs.delete(id);
    await act(async () => callback(0));
  };
  return { state, frames, rafs, request, cancel, raf, cancelRaf, draw, clear, video, add, remove, mode, nativeFrame, fallbackFrame };
}

it("scrubTime editorial sem canvas não reinstala listeners nem cancela rVFC em reprodução", async () => {
  const media = await mount();
  expect(media.draw).toHaveBeenCalledTimes(2); expect(media.request).toHaveBeenCalledOnce();
  await view!.render(<Fixture scrubTime={3}/>);
  await view!.render(<Fixture scrubTime={5}/>);
  expect(media.request).toHaveBeenCalledOnce(); expect(media.cancel).not.toHaveBeenCalled();
  expect(media.add).not.toHaveBeenCalled(); expect(media.remove).not.toHaveBeenCalled();
  expect(media.draw).toHaveBeenCalledTimes(2);
  await media.nativeFrame(5);
  expect(media.mode()).toBe("split"); expect(media.draw).toHaveBeenCalledTimes(4);
  await media.nativeFrame(3);
  expect(media.mode()).toBe("single"); expect(media.draw).toHaveBeenCalledTimes(4);
  expect(media.frames.size).toBe(1);
  await view!.close(); view = undefined;
  expect(media.frames.size).toBe(0); expect(media.cancel).toHaveBeenCalledOnce();
});

it("vídeo pausado sem canvas usa currentTime em seek e pause, sem redesenhar por scrubTime", async () => {
  const media = await mount({ paused: true });
  await view!.render(<Fixture scrubTime={3}/>);
  expect(media.draw).toHaveBeenCalledTimes(2); expect(media.add).not.toHaveBeenCalled();
  expect(media.request).not.toHaveBeenCalled();
  media.state.time = 3;
  await act(async () => media.video.dispatchEvent(new window.Event("seeked")));
  expect(media.mode()).toBe("single");
  media.state.time = 5;
  await act(async () => media.video.dispatchEvent(new window.Event("pause")));
  expect(media.mode()).toBe("split"); expect(media.draw).toHaveBeenCalledTimes(4);
});

it("canvas pausado mantém seu tempo de fonte e redesenha ao trocar tempo ou pixels", async () => {
  const media = await mount({ paused: true });
  media.state.time = 3;
  const scrub = document.createElement("canvas"); scrub.width = 640; scrub.height = 360;
  await view!.render(<Fixture scrub={scrub} scrubTime={1}/>);
  expect(media.mode()).toBe("split"); expect(media.draw.mock.calls[media.draw.mock.calls.length - 1]?.[0]).toBe(scrub);
  const painted = media.draw.mock.calls.length;
  await view!.render(<Fixture scrub={scrub} scrubTime={3}/>);
  expect(media.mode()).toBe("single"); expect(media.draw).toHaveBeenCalledTimes(painted);
  await view!.render(<Fixture scrub={scrub} scrubTime={5}/>);
  expect(media.mode()).toBe("split"); expect(media.draw).toHaveBeenCalledTimes(painted + 2);
  const replacement = document.createElement("canvas"); replacement.width = 640; replacement.height = 360;
  await view!.render(<Fixture scrub={replacement} scrubTime={5}/>);
  expect(media.draw.mock.calls[media.draw.mock.calls.length - 1]?.[0]).toBe(replacement);
  await view!.render(<Fixture scrub={replacement}/>);
  expect(media.mode()).toBe("single");
  media.state.time = 5;
  await view!.render(<Fixture scrubTime={1}/>);
  expect(media.mode()).toBe("split"); expect(media.draw.mock.calls[media.draw.mock.calls.length - 1]?.[0]).toBe(media.video);
});

it("layout, URL, pause, play e desmontagem preservam a renovação necessária do callback", async () => {
  const media = await mount();
  const nextLayout = { ...layout, shots: layout.shots!.slice(1) };
  await view!.render(<Fixture layout={nextLayout} scrubTime={1}/>);
  expect(media.mode()).toBe("single"); expect(media.cancel).toHaveBeenCalledOnce(); expect(media.request).toHaveBeenCalledTimes(2);
  await view!.render(<Fixture layout={nextLayout} localUrl="replacement.mp4" scrubTime={1}/>);
  expect(media.cancel).toHaveBeenCalledTimes(2); expect(media.request).toHaveBeenCalledTimes(3);
  media.state.paused = true;
  await act(async () => media.video.dispatchEvent(new window.Event("pause")));
  expect(media.frames.size).toBe(0); expect(media.cancel).toHaveBeenCalledTimes(3);
  media.state.time = 5; media.state.paused = false;
  await act(async () => media.video.dispatchEvent(new window.Event("play")));
  expect(media.mode()).toBe("split"); expect(media.frames.size).toBe(1);
  const painted = media.draw.mock.calls.length;
  await act(async () => media.video.dispatchEvent(new window.Event("loadeddata")));
  await act(async () => media.video.dispatchEvent(new window.Event("resize")));
  expect(media.draw).toHaveBeenCalledTimes(painted + 4);
  await view!.close(); view = undefined;
  expect(media.frames.size).toBe(0); expect(media.remove).toHaveBeenCalledTimes(15);
});

it("fallback RAF ignora scrubTime sem canvas e mantém seek, pause e cleanup", async () => {
  const media = await mount({ native: false });
  await view!.render(<Fixture scrubTime={5}/>);
  expect(media.raf).toHaveBeenCalledOnce(); expect(media.cancelRaf).not.toHaveBeenCalled();
  expect(media.add).not.toHaveBeenCalled(); expect(media.remove).not.toHaveBeenCalled();
  media.state.time = 3;
  await media.fallbackFrame(); expect(media.mode()).toBe("single"); expect(media.rafs.size).toBe(1);
  media.state.paused = true;
  await act(async () => media.video.dispatchEvent(new window.Event("pause")));
  expect(media.rafs.size).toBe(0);
  media.state.time = 5;
  await act(async () => media.video.dispatchEvent(new window.Event("seeked")));
  expect(media.mode()).toBe("split");
  media.state.paused = false;
  await act(async () => media.video.dispatchEvent(new window.Event("play")));
  expect(media.rafs.size).toBe(1);
  await view!.close(); view = undefined;
  expect(media.rafs.size).toBe(0); expect(media.cancelRaf).toHaveBeenCalledTimes(2);
});
