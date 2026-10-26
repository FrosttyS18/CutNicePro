import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectThumbnail } from "../components/workspace/ProjectThumbnail";
import { emptyWorkspace } from "../lib/workspace";
import { saveWorkspace } from "../services/workspace-store";
import { reactHost } from "./react-host";
import type { Window } from "happy-dom";

const thumbnails = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../services/clip-thumbnails", () => ({ loadClipThumbnail: thumbnails.load }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let reveal: () => void = () => {};
const disconnect = vi.fn();
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });

function prepare(environment: Window) {
  reveal = () => {};
  vi.stubGlobal("localStorage", environment.localStorage);
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "persisted", name: "video.mp4", duration: 60, width: 1920, height: 1080, videoId: null, url: null };
  expect(saveWorkspace("project", data)).toBe(true);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { reveal = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    observe() {}
    disconnect = disconnect;
  });
}

it("reabre miniatura persistida sem depender de URL de sessão ou carregar um player por cartão", async () => {
  thumbnails.load.mockResolvedValue({ src: "data:image/jpeg;base64,AA==", width: 1920, height: 1080 });
  mounted = await reactHost(<ProjectThumbnail id="project"/>, prepare);
  expect(thumbnails.load).not.toHaveBeenCalled();
  await act(async () => { reveal(); });
  expect(thumbnails.load).toHaveBeenCalledWith("persisted", 5);
  const image = mounted.host.querySelector("img")!;
  expect(image.getAttribute("src")).toBe("data:image/jpeg;base64,AA==");
  expect(image.loading).toBe("lazy");
  expect(mounted.host.querySelector("video")).toBeNull();
  expect(disconnect).toHaveBeenCalled();
});

it("uma mídia indisponível não impede outro projeto de carregar e desconecta a observação", async () => {
  thumbnails.load.mockRejectedValueOnce(new Error("Vídeo indisponível")).mockResolvedValue({ src: "data:image/jpeg;base64,AQ==", width: 640, height: 360 });
  mounted = await reactHost(<ProjectThumbnail id="project"/>, prepare);
  await act(async () => { reveal(); });
  expect(mounted.host.querySelector("img")).toBeNull();
  const second = emptyWorkspace();
  second.media = { kind: "local", mediaId: "second", name: "outro.mp4", duration: 1, width: 640, height: 360, videoId: null, url: null };
  saveWorkspace("second", second);
  await mounted.render(<ProjectThumbnail id="second"/>);
  await act(async () => { reveal(); });
  expect(thumbnails.load).toHaveBeenLastCalledWith("second", .1);
  expect(mounted.host.querySelector("img")?.getAttribute("src")).toBe("data:image/jpeg;base64,AQ==");
  await mounted.close(); mounted = undefined;
  expect(disconnect.mock.calls.length).toBeGreaterThanOrEqual(2);
});
