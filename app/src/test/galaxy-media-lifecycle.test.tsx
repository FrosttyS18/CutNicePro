import { act, StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Texture } from "three";
import HeroGalaxy from "../components/galaxy/hero-galaxy";
import { reactHost } from "./react-host";

const resources = vi.hoisted(() => ({
  videos: [] as HTMLVideoElement[],
  textures: [] as { texture: Texture; disposed: number }[],
  loaded: [] as (() => void)[],
}));

vi.mock("../components/galaxy/galaxy-media", () => ({ GALAXY_MEDIA: [
  { id: "one", videoUrl: "fixture:one", poster: "fixture:poster-one", aspect: 16 / 9, mediaType: "video" },
  { id: "two", videoUrl: "fixture:two", poster: "fixture:poster-two", aspect: 9 / 16, mediaType: "video" },
] }));
vi.mock("three", async importOriginal => {
  const actual = await importOriginal<typeof import("three")>();
  const track = (texture: Texture) => {
    const entry = { texture, disposed: 0 };
    texture.addEventListener("dispose", () => { entry.disposed += 1; });
    resources.textures.push(entry);
    return texture;
  };
  return { ...actual,
    TextureLoader: class {
      load(_url: string, loaded: () => void) {
        const texture = track(new actual.Texture());
        resources.loaded.push(loaded);
        return texture;
      }
    },
    VideoTexture: class extends actual.VideoTexture {
      constructor(video: HTMLVideoElement) { super(video); track(this); }
    },
  };
});
vi.mock("@react-three/fiber", () => {
  const size = { width: 1280, height: 720 };
  const state = { size, get: () => ({ camera: null }) };
  return {
    Canvas: ({ children }: { children: ReactNode }) => <svg>{children}</svg>,
    useFrame: () => undefined,
    useThree: <T,>(select: (value: typeof state) => T) => select(state),
  };
});
vi.mock("../components/galaxy/webgl-support", () => ({ webglAvailable: () => true }));
vi.mock("../components/galaxy/theme-colors", () => ({ watchThemeColors: (receive: (colors: Record<string, string>) => void) => {
  receive({ bg: "#101010", bgSunken: "#080808", ink: "#eeeeee", line: "#333333", lineStrong: "#555555", accent: "#00bbbb", accentInk: "#101010" });
  return () => undefined;
} }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;

beforeEach(() => {
  resources.videos = []; resources.textures = []; resources.loaded = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
});
afterEach(async () => {
  await mounted?.close(); mounted = undefined;
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function mount(strict = true) {
  mounted = await reactHost(strict ? <StrictMode><HeroGalaxy /></StrictMode> : <HeroGalaxy />, environment => {
    const create = environment.document.createElement.bind(environment.document);
    vi.spyOn(environment.document, "createElement").mockImplementation((tag, options) => {
      const element = create(tag, options);
      if (tag === "video") {
        const video = element as unknown as HTMLVideoElement;
        video.load = vi.fn(); video.pause = vi.fn();
        resources.videos.push(video);
      }
      return element;
    });
  });
}

describe("propriedade das mídias da Home", () => {
  it("libera todas as mídias e texturas criadas no replay do StrictMode", async () => {
    await mount();
    expect(resources.videos.length).toBeGreaterThan(0);
    expect(resources.textures.length).toBeGreaterThan(0);
    await mounted!.close(); mounted = undefined;
    expect(resources.videos.filter(video => video.hasAttribute("src"))).toHaveLength(0);
    expect(resources.textures.map(entry => entry.disposed)).toEqual(resources.textures.map(() => 1));
  });

  it("remove os callbacks e impede retries ou seeks tardios após desmontar", async () => {
    await mount();
    await act(async () => { vi.advanceTimersByTime(1000); });
    const videos = [...resources.videos];
    const EventConstructor = window.Event;
    await mounted!.close(); mounted = undefined;
    expect(vi.getTimerCount()).toBe(0);
    const loads = videos.map(video => vi.mocked(video.load).mock.calls.length);
    videos.forEach(video => {
      Object.defineProperty(video, "duration", { configurable: true, value: 8 });
      video.dispatchEvent(new EventConstructor("error"));
      video.dispatchEvent(new EventConstructor("loadedmetadata"));
    });
    resources.loaded.forEach(loaded => loaded());
    expect(vi.getTimerCount()).toBe(0);
    expect(videos.map(video => video.currentTime)).toEqual(videos.map(() => 0));
    vi.advanceTimersByTime(100_000);
    expect(videos.map(video => vi.mocked(video.load).mock.calls.length)).toEqual(loads);
  });

  it("mantém o priming e as três tentativas de recarga enquanto o owner está ativo", async () => {
    await mount(false);
    const video = resources.videos[0];
    expect(video.src).toBe("fixture:one");
    expect(video.muted).toBe(true); expect(video.loop).toBe(true);
    expect(video.preload).toBe("metadata"); expect(video.crossOrigin).toBe("anonymous");
    Object.defineProperty(video, "readyState", { configurable: true, value: 1 });
    Object.defineProperty(video, "duration", { configurable: true, value: 8 });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(video.currentTime).toBeCloseTo(0.1);
    for (const delay of [15_000, 30_000, 45_000]) {
      const before = vi.mocked(video.load).mock.calls.length;
      video.dispatchEvent(new window.Event("error"));
      vi.advanceTimersByTime(delay - 1);
      expect(video.load).toHaveBeenCalledTimes(before);
      vi.advanceTimersByTime(1);
      expect(video.load).toHaveBeenCalledTimes(before + 1);
    }
    video.dispatchEvent(new window.Event("error"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
