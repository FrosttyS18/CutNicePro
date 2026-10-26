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

it("mantém reprodução e busca acessíveis na inspeção de um split", async () => {
  const toggle = vi.fn();
  const view = await reactHost(<VideoPreview media={null} localUrl="test.mp4" onTogglePlay={toggle}
    settings={{ ...defaultEditorSettings(), ratio: "9:16", splitScreen: { ...defaultSplitScreen(), faceValidated: true } }}/>, environment => {
    vi.stubGlobal("Event", environment.Event);
    Object.defineProperty(environment.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ clearRect: vi.fn(), drawImage: vi.fn() }) });
    for (const [key, value] of Object.entries({ videoWidth: 1920, videoHeight: 1080, readyState: 2, duration: 30, paused: true })) {
      Object.defineProperty(environment.HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
    }
  });
  const video = view.host.querySelector("video")!;
  const play = view.host.querySelector<HTMLButtonElement>('button[aria-label="Reproduzir"]');
  expect(play).not.toBeNull();
  await act(async () => play!.click());
  expect(toggle).toHaveBeenCalledTimes(1);
  const end = view.host.querySelector<HTMLButtonElement>('button[aria-label="Ir para o fim"]');
  await act(async () => end!.click());
  expect(video.currentTime).toBe(30);
  expect(view.host.querySelector('input[aria-label="Posição da prévia"]')).not.toBeNull();
  expect(view.host.querySelectorAll("video")).toHaveLength(1);
  await view.close();
});
