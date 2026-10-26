import { act, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompositionStage } from "../components/editor/CompositionStage";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

const decoder = vi.hoisted(() => ({ disposedReads: 0 }));
vi.mock("../lib/frame-seeker", () => ({ FrameSeeker: class {
  private disposed = false;
  getFrameAt() { if (this.disposed) decoder.disposedReads++; return Promise.resolve(null); }
  dispose() { this.disposed = true; }
} }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let ready = 4;
let contexts: ReturnType<typeof vi.fn>;
let close: ReturnType<typeof vi.fn>;
beforeEach(() => { ready = 4; decoder.disposedReads = 0; close = vi.fn(async () => undefined); });
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.unstubAllGlobals(); });

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  workspace.settings.trimStart = 3;
  workspace.settings.trimEnd = 8;
  workspace.settings.volume = 0.5;
  return compositionFromLegacy(workspace);
}

async function stage(document = fixture(), playing = true, strict = false) {
  const error = vi.fn();
  const sourceBindings = new WeakSet<HTMLMediaElement>();
  contexts = vi.fn(function () {
    return { state: "running", destination: {}, resume: vi.fn(async () => undefined), close,
      createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
      createMediaElementSource: (element: HTMLMediaElement) => {
        if (sourceBindings.has(element)) throw new DOMException("Element already bound", "InvalidStateError");
        sourceBindings.add(element);
        return { connect: vi.fn(), disconnect: vi.fn() };
      } };
  });
  vi.stubGlobal("AudioContext", contexts);
  const node = <CompositionStage document={document} frame={30} playing={playing} media={{ source: { url: "source.mp4", error: null } }} onError={error} />;
  mounted = await reactHost(strict ? <StrictMode>{node}</StrictMode> : node, environment => {
    const positions = new WeakMap<HTMLMediaElement, number>();
    const paused = new WeakMap<HTMLMediaElement, boolean>();
    Object.defineProperty(environment.HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => ready });
    Object.defineProperty(environment.HTMLMediaElement.prototype, "currentTime", { configurable: true,
      get: function (this: HTMLMediaElement) { return positions.get(this) ?? 0; },
      set: function (this: HTMLMediaElement, value: number) {
        if (!ready && value > 0) throw new DOMException("Metadata missing", "InvalidStateError");
        positions.set(this, value);
      } });
    Object.defineProperty(environment.HTMLMediaElement.prototype, "paused", { configurable: true, get: function (this: HTMLMediaElement) { return paused.get(this) ?? true; } });
    environment.HTMLMediaElement.prototype.play = vi.fn(async function (this: HTMLMediaElement) { paused.set(this, false); });
    environment.HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLMediaElement) { paused.set(this, true); });
    environment.HTMLMediaElement.prototype.load = vi.fn();
  });
  return { error, document };
}

describe("vida útil real dos elementos de mídia da montagem", () => {
  it("replay de efeitos do StrictMode preserva src e cria um decoder utilizável", async () => {
    const { error } = await stage(fixture(), false, true);
    expect(mounted!.host.querySelector("video")!.getAttribute("src")).toBe("source.mp4");
    expect(decoder.disposedReads).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });

  it("reproduz som original pelo vídeo, sem criar audio duplicado nem AudioContext", async () => {
    const { error } = await stage();
    const video = mounted!.host.querySelector("video")!;
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(0.5);
    expect(video.paused).toBe(false);
    expect(mounted!.host.querySelector("audio")).toBeNull();
    expect(contexts).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("aguarda metadados antes de buscar e inicia na posição mais recente ao carregar", async () => {
    ready = 0;
    const { error, document } = await stage();
    expect(error).not.toHaveBeenCalled();
    const video = mounted!.host.querySelector("video")!;
    expect(video.currentTime).toBe(0);
    expect(video.paused).toBe(true);
    await mounted!.render(<CompositionStage document={document} frame={60} playing media={{ source: { url: "source.mp4", error: null } }} onError={error} />);
    ready = 4;
    await act(async () => { video.dispatchEvent(new window.Event("loadedmetadata")); });
    expect(video.currentTime).toBe(5);
    expect(video.paused).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it("reconectar URL no mesmo asset mantém o elemento com a fonte nova", async () => {
    const { error, document } = await stage();
    const video = mounted!.host.querySelector("video")!;
    await mounted!.render(<CompositionStage document={document} frame={30} playing media={{ source: { url: "reconnected.mp4", error: null } }} onError={error} />);
    expect(mounted!.host.querySelector("video")).toBe(video);
    expect(video.getAttribute("src")).toBe("reconnected.mp4");
    expect(error).not.toHaveBeenCalled();
  });

  it("boost explícito não refaz binding nem fecha contexto durante replay do StrictMode", async () => {
    const document = fixture();
    document.items.forEach(item => { item.settings.volume = 1.5; });
    const { error } = await stage(document, true, true);
    expect(error).not.toHaveBeenCalled();
    expect(contexts).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    await mounted!.close(); mounted = undefined;
    expect(close).toHaveBeenCalledOnce();
  });

  it("áudio desvinculado continua independente e obedece volume nativo", async () => {
    const document = fixture();
    const audio = document.items.find(item => item.kind === "audio")!;
    audio.groupId = "independent";
    audio.settings.volume = 0.25;
    const { error } = await stage(document);
    const video = mounted!.host.querySelector("video")!;
    const element = mounted!.host.querySelector("audio")!;
    expect(element).not.toBeNull();
    expect(element.volume).toBe(0.25);
    expect(video.muted).toBe(true);
    expect(contexts).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("ocultar a faixa visual preserva a reprodução do áudio original exportável", async () => {
    const document = fixture();
    document.tracks.find(track => track.id === "V1")!.hidden = true;
    const { error } = await stage(document);
    const audio = mounted!.host.querySelector("audio")!;
    expect(mounted!.host.querySelector("video")).toBeNull();
    expect(audio).not.toBeNull();
    expect(audio.volume).toBe(0.5);
    expect(audio.paused).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it("silenciar A1 legado não ativa o som embutido no vídeo", async () => {
    const document = fixture();
    document.tracks.find(track => track.id === "A1")!.muted = true;
    const { error } = await stage(document);
    expect(mounted!.host.querySelector("audio")).toBeNull();
    expect(mounted!.host.querySelector("video")!.muted).toBe(true);
    expect(contexts).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
