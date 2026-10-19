import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectLocalVideo } from "../lib/video-source";

function createVideo() {
  return {
    videoWidth: 320, videoHeight: 180, duration: 2, currentTime: 0,
    onloadedmetadata: null as (() => void) | null,
    ondurationchange: null as (() => void) | null,
    onseeked: null as (() => void) | null,
    onerror: null as (() => void) | null,
    removeAttribute: vi.fn(), load: vi.fn(), preload: "", src: "",
  };
}

describe("inspeção local e lifecycle da prévia", () => {
  let video = createVideo();
  const file = new File(["fixture"], "video.webm", { type: "video/webm" });
  beforeEach(() => {
    vi.useFakeTimers();
    video = createVideo();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("document", { createElement: () => video });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("resolve metadados reais e transfere a URL ao consumidor", async () => {
    const result = inspectLocalVideo(file, new AbortController().signal);
    video.onloadedmetadata!();
    expect(await result).toMatchObject({ url: "blob:fixture", width: 320, height: 180, duration: 2 });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(video.onloadedmetadata).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recusa erro de codec e libera a URL", async () => {
    const result = inspectLocalVideo(file, new AbortController().signal);
    const rejected = expect(result).rejects.toThrow("codec incompatível");
    video.onerror!();
    await rejected;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fixture");
  });

  it("aborta ao trocar de arquivo ou desmontar", async () => {
    const controller = new AbortController();
    const result = inspectLocalVideo(file, controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(video.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aceita prévia de WebM sem duração no cabeçalho, sem inventar metadados", async () => {
    video.duration = Infinity;
    const result = inspectLocalVideo(file, new AbortController().signal);
    video.onloadedmetadata!();
    expect((await result).duration).toBeNull();
    expect(video.currentTime).toBe(0);
  });

  it("encerra leitura que não responde", async () => {
    const result = inspectLocalVideo(file, new AbortController().signal);
    const rejected = expect(result).rejects.toThrow("demorou demais");
    vi.advanceTimersByTime(15000);
    await rejected;
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
