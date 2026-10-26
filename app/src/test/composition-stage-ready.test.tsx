import { act, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionStage } from "../components/editor/CompositionStage";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";
import type { Composition } from "../lib/composition-types";

vi.mock("../lib/frame-seeker", () => ({ FrameSeeker: class { getFrameAt() { return Promise.resolve(null); } dispose() {} } }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });
function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  return compositionFromLegacy(workspace);
}
function render(document: Composition, ready: (value: boolean) => void, url = "source.mp4") {
  return <StrictMode><CompositionStage document={document} frame={0} playing media={{ source: { url, error: null } }} onError={vi.fn()} onReady={ready}/></StrictMode>;
}
async function mount(document = fixture(), rejectPlay = false, pendingPlay = false) {
  const ready = vi.fn();
  let allowed = !rejectPlay;
  let pending = pendingPlay;
  let rejectPending: ((error: DOMException) => void) | undefined;
  const play = vi.fn(async function (this: HTMLElement) {
    if (!allowed) throw new DOMException("Autoplay blocked", "NotAllowedError");
    this.dataset.paused = "false";
    if (pending) await new Promise<void>((_resolve,reject) => { rejectPending = reject; });
  });
  mounted = await reactHost(render(document, ready), environment => {
    Object.defineProperty(environment.HTMLMediaElement.prototype, "readyState", { configurable: true, get: function (this: HTMLElement) { return Number(this.dataset.ready ?? 0); } });
    Object.defineProperty(environment.HTMLMediaElement.prototype, "seeking", { configurable: true, get: function (this: HTMLElement) { return this.dataset.seeking === "true"; } });
    Object.defineProperty(environment.HTMLMediaElement.prototype, "paused", { configurable: true, get: function (this: HTMLElement) { return this.dataset.paused !== "false"; } });
    environment.HTMLMediaElement.prototype.play = play;
    environment.HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLElement) {
      this.dataset.paused = "true";
      if(rejectPending){const reject=rejectPending;rejectPending=undefined;reject(new DOMException("Playback interrupted by pause","AbortError"));}
    });
    environment.HTMLMediaElement.prototype.load = vi.fn();
    Object.defineProperty(environment.HTMLImageElement.prototype, "complete", { configurable: true, get: function (this: HTMLElement) { return this.dataset.loaded === "true"; } });
    Object.defineProperty(environment.HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: function (this: HTMLElement) { return this.dataset.loaded === "true" ? 512 : 0; } });
    Object.defineProperty(environment.HTMLImageElement.prototype, "currentSrc", { configurable: true, get: function (this: HTMLImageElement) { return this.dataset.currentSrc ?? this.src; } });
  });
  return { ready, document, play, allowPlay: () => { allowed = true; }, settlePlay: () => { pending = false; }, last: () => ready.mock.calls[ready.mock.calls.length - 1]?.[0] };
}

describe("prontidão das fontes ativas da montagem", () => {
  it("metadata, waiting, seek e erro governam prontidão sem avançar por presunção", async () => {
    const { last } = await mount();
    const video = mounted!.host.querySelector("video")!;
    expect(last()).toBe(false);
    await act(async () => { video.dataset.ready = "4"; video.dispatchEvent(new window.Event("loadedmetadata")); video.dispatchEvent(new window.Event("canplay")); });
    expect(last()).toBe(true);
    await act(async () => { video.dispatchEvent(new window.Event("waiting")); });
    expect(last()).toBe(false);
    await act(async () => { video.dispatchEvent(new window.Event("canplay")); });
    expect(last()).toBe(true);
    await act(async () => { video.dataset.seeking = "true"; video.dispatchEvent(new window.Event("seeking")); });
    expect(last()).toBe(false);
    await act(async () => { video.dataset.seeking = "false"; video.dispatchEvent(new window.Event("seeked")); });
    expect(last()).toBe(true);
    await act(async () => { video.dispatchEvent(new window.Event("error")); });
    expect(last()).toBe(false);
  });

  it("espera todas as fontes e não aceita um evento de elemento já removido", async () => {
    const document = fixture();
    const audio = document.items.find(item => item.kind === "audio")!; audio.groupId = "independent";
    const { ready, last } = await mount(document);
    const video = mounted!.host.querySelector("video")!;
    const element = mounted!.host.querySelector("audio")!;
    await act(async () => { video.dataset.ready = "4"; video.dispatchEvent(new window.Event("loadedmetadata")); video.dispatchEvent(new window.Event("canplay")); });
    expect(last()).toBe(false);
    await act(async () => { element.dataset.ready = "4"; element.dispatchEvent(new window.Event("loadedmetadata")); element.dispatchEvent(new window.Event("canplay")); });
    expect(last()).toBe(true);
    const next = { ...document, items: [] };
    await mounted!.render(render(next, ready));
    expect(last()).toBe(true);
    const calls = ready.mock.calls.length;
    await act(async () => { video.dispatchEvent(new window.Event("waiting")); element.dispatchEvent(new window.Event("error")); });
    expect(ready.mock.calls.length).toBe(calls);
  });

  it("imagem exige load da URL atual e montagem vazia fica pronta", async () => {
    const document = fixture();
    document.assets = [{ id: "source", mediaId: "source", name: "Imagem.png", kind: "image", durationUs: 0, width: 512, height: 512, transcript: [] }];
    document.items = [{ ...document.items[0], kind: "image", sourceStartUs: 0, sourceEndUs: 0 }];
    const { ready, last } = await mount(document);
    const image = mounted!.host.querySelector("img")!;
    expect(last()).toBe(false);
    await act(async () => { image.dataset.loaded = "true"; image.dataset.currentSrc = image.src; image.dispatchEvent(new window.Event("load")); });
    expect(last()).toBe(true);
    await mounted!.render(render(document, ready, "next.png"));
    expect(last()).toBe(false);
    await act(async () => { image.dispatchEvent(new window.Event("load")); });
    expect(last()).toBe(false);
    await act(async () => { image.dataset.currentSrc = image.src; image.dispatchEvent(new window.Event("load")); });
    expect(last()).toBe(true);
    await mounted!.render(render({ ...document, items: [] }, ready));
    expect(last()).toBe(true);
  });

  it("recusa de autoplay congela sem tentar novamente até nova intenção explícita",async()=>{
    const {ready,document,last,play,allowPlay}=await mount(fixture(),true);
    const video=mounted!.host.querySelector("video")!;
    await act(async()=>{video.dataset.ready="4";video.dispatchEvent(new window.Event("loadedmetadata"));video.dispatchEvent(new window.Event("canplay"));});
    expect(play).toHaveBeenCalledOnce();expect(last()).toBe(false);expect(video.paused).toBe(true);
    await act(async()=>{video.dispatchEvent(new window.Event("canplay"));video.dispatchEvent(new window.Event("seeked"));});
    expect(play).toHaveBeenCalledOnce();expect(last()).toBe(false);
    allowPlay();
    await mounted!.render(<StrictMode><CompositionStage document={document} frame={0} playing={false} media={{source:{url:"source.mp4",error:null}}} onError={vi.fn()} onReady={ready}/></StrictMode>);
    await mounted!.render(render(document,ready));
    expect(play).toHaveBeenCalledTimes(2);expect(last()).toBe(true);expect(video.paused).toBe(false);
  });
  it("pause durante waiting pode abortar play pendente sem bloquear a retomada",async()=>{
    const {last,play,settlePlay}=await mount(fixture(),false,true);
    const video=mounted!.host.querySelector("video")!;
    await act(async()=>{video.dataset.ready="4";video.dispatchEvent(new window.Event("loadedmetadata"));video.dispatchEvent(new window.Event("canplay"));});
    expect(last()).toBe(true);expect(play).toHaveBeenCalledOnce();
    await act(async()=>{video.dispatchEvent(new window.Event("waiting"));});
    expect(last()).toBe(false);expect(video.paused).toBe(true);
    settlePlay();
    await act(async()=>{video.dispatchEvent(new window.Event("canplay"));});
    expect(last()).toBe(true);expect(play).toHaveBeenCalledTimes(2);expect(video.paused).toBe(false);
  });
});
