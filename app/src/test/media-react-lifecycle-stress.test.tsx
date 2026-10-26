import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { CompositionStage } from "../components/editor/CompositionStage";
import { SavedCompositionPoster } from "../components/clips/SavedCompositionPoster";
import { useTimelinePreview } from "../hooks/useTimelinePreview";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";

const resources = vi.hoisted(() => ({ inputs: 0, disposed: 0, liveInputs: 0, maximumInputs: 0, iterators: 0, closedIterators: 0, liveIterators: 0,
  trackGate: null as Promise<void> | null }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("mediabunny", () => ({
  ALL_FORMATS: [], BlobSource: class {}, UrlSource: class {},
  Input: class {
    private closed = false;
    private gate = resources.trackGate;
    constructor() { resources.inputs += 1; resources.liveInputs += 1; resources.maximumInputs = Math.max(resources.maximumInputs, resources.liveInputs); }
    async getPrimaryVideoTrack() { await this.gate; return { displayWidth: 1920, displayHeight: 1080 }; }
    dispose() { if (!this.closed) { this.closed = true; resources.disposed += 1; resources.liveInputs -= 1; } }
  },
  CanvasSink: class {
    async *canvases(start: number) {
      resources.iterators += 1; resources.liveIterators += 1;
      try { for (let frame = 0; frame < 250; frame += 1) yield { canvas: { width: 0, height: 0 }, timestamp: start + frame / 25, duration: .04 }; }
      finally { resources.closedIterators += 1; resources.liveIterators -= 1; }
    }
  },
}));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
beforeEach(() => { Object.assign(resources, { inputs: 0, disposed: 0, liveInputs: 0, maximumInputs: 0, iterators: 0, closedIterators: 0, liveIterators: 0, trackGate: null }); });
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function fixture(id: string) {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: id, name: `${id}.mp4`, duration: 120, width: 1920, height: 1080, videoId: null, url: null };
  return compositionFromLegacy(data);
}

it("Stage real atravessa 200 seeks e 10 projetos sem reter Input, iterador ou AudioContext", async () => {
  const audio = { contexts: 0, closed: 0, live: 0, maximum: 0, sources: 0, disconnectedSources: 0, gains: 0, disconnectedGains: 0, mediaAcquired: 0, mediaReleased: 0 };
  const errors = vi.fn();
  const playing = new WeakSet<HTMLMediaElement>();
  const acquired = new WeakSet<HTMLMediaElement>();
  const recordMedia = () => {
    for(const element of mounted!.host.querySelectorAll<HTMLMediaElement>("video,audio")) {
      if(!acquired.has(element)){acquired.add(element);audio.mediaAcquired+=1;}
    }
  };
  const stage = (project: number, frame: number, play = false) => {
    const id = `project-${project}`;
    const document=fixture(id);
    if(play)document.items.forEach(item=>{item.settings.volume=1.5;});
    return <CompositionStage key={id} document={document} media={{ [id]: { url: `fixture:${id}`, error: null } }} frame={frame} playing={play} onError={errors} />;
  };
  mounted = await reactHost(stage(0, 0), environment => {
    class Context {
      state = "running";
      destination = {};
      private closed = false;
      constructor() { audio.contexts += 1; audio.live += 1; audio.maximum = Math.max(audio.maximum, audio.live); }
      createMediaElementSource() { audio.sources += 1; let closed = false; return { connect() {}, disconnect() { if (!closed) { closed = true; audio.disconnectedSources += 1; } } }; }
      createGain() { audio.gains += 1; let closed = false; return { gain: { value: 1 }, connect() {}, disconnect() { if (!closed) { closed = true; audio.disconnectedGains += 1; } } }; }
      async resume() {}
      async close() { if (!this.closed) { this.closed = true; audio.closed += 1; audio.live -= 1; } }
    }
    vi.stubGlobal("AudioContext", Context);
    Object.defineProperty(environment.HTMLMediaElement.prototype, "readyState", { configurable: true, get() { return 4; } });
    Object.defineProperty(environment.HTMLMediaElement.prototype, "paused", { configurable: true, get(this: HTMLMediaElement) { return !playing.has(this); } });
    environment.HTMLMediaElement.prototype.play = async function () { playing.add(this as unknown as HTMLMediaElement); };
    environment.HTMLMediaElement.prototype.pause = function () { playing.delete(this as unknown as HTMLMediaElement); };
    environment.HTMLMediaElement.prototype.load = function () { if (!this.getAttribute("src")) audio.mediaReleased += 1; };
  });
  for (let project = 0; project < 10; project += 1) {
    if (project) await mounted.render(stage(project, 0));
    recordMedia();
    for (let seek = 1; seek <= 20; seek += 1) await mounted.render(stage(project, (seek * 197) % 3300));
    const last = (20 * 197) % 3300;
    await mounted.render(stage(project, last, true));
    expect(mounted.host.querySelectorAll("video")).toHaveLength(1);
    expect(mounted.host.querySelector("audio")).toBeNull();
    expect(playing.has(mounted.host.querySelector("video")!)).toBe(true);
    await mounted.render(stage(project, last));
    expect(playing.has(mounted.host.querySelector("video")!)).toBe(false);
    expect(resources.liveInputs).toBe(1);
    expect(audio.live).toBe(1);
  }
  let release!: () => void;
  resources.trackGate = new Promise<void>(resolve => { release = resolve; });
  await mounted.render(stage(10, 0));
  recordMedia();
  await mounted.close(); mounted = undefined;
  expect(resources.liveInputs).toBe(0);
  release(); await Promise.resolve(); await Promise.resolve();
  expect(errors).not.toHaveBeenCalled();
  expect(resources).toMatchObject({ inputs: 11, disposed: 11, liveInputs: 0, maximumInputs: 1, iterators: 210, closedIterators: 210, liveIterators: 0 });
  expect(audio).toMatchObject({ contexts: 10, closed: 10, live: 0, maximum: 1, sources: 10, disconnectedSources: 10, gains: 10, disconnectedGains: 10, mediaAcquired: 11, mediaReleased: 11 });
  console.info("M5_STAGE_RESOURCES", JSON.stringify({ seeks: 200, projectChanges: 10, ...resources, trackGate: undefined, audio }));
});

it("10 trocas da timeline e miniatura descartam respostas tardias e revogam todas as URLs", async () => {
  const pending = new Map<string, (value: unknown) => void>();
  const urls = new Set<string>();
  const counts = { created: 0, revoked: 0, invalidRevoke: 0, maximum: 0, observers: 0, closedObservers: 0, nativePending: 0 };
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    const url = `blob:stress-${++counts.created}`; urls.add(url); counts.maximum = Math.max(counts.maximum, urls.size); return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(url => { if (urls.delete(url)) counts.revoked += 1; else counts.invalidRevoke += 1; });
  vi.mocked(invoke).mockImplementation((command, args) => {
    const data = args as { mediaId?: string; projectId?: string };
    const id = command === "timeline_preview" ? data.mediaId : data.projectId;
    counts.nativePending += 1;
    return new Promise(resolve => pending.set(`${command}:${id}`, resolve)).finally(() => { counts.nativePending -= 1; });
  });
  class Observer {
    private closed = false;
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) { counts.observers += 1; }
    observe() { this.callback([{ isIntersecting: true }]); }
    disconnect() { if (!this.closed) { this.closed = true; counts.closedObservers += 1; } }
  }
  function Previews({ project }: { project?: number }) {
    const id = project === undefined ? undefined : `preview-${project}`;
    const preview = useTimelinePreview(id);
    const entry: LibraryClip | null = id ? { project: { id, name: id, created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }, mediaId: id,
      clip: { id: "a".repeat(64), start: 0, end: 120, title: "Manual", score: null, review: "pending", reasons: [], origin: "manual" },
      composition: { document: { ...fixture(id), revision: 1 }, manuallyEdited: false, editedAtMs: 1, origin: "manual", title: "Manual", createdAtMs: 1 } } : null;
    return <div>{preview.frames.map(src => <img key={src} src={src} alt="" />)}{entry && <SavedCompositionPoster entry={entry} />}<output>{preview.frames.length}</output></div>;
  }
  mounted = await reactHost(<Previews project={0} />, () => { vi.stubGlobal("IntersectionObserver", Observer); });
  for (let project = 0; project < 10; project += 1) {
    if (project) await mounted.render(<Previews project={project} />);
    expect(mounted.host.querySelectorAll("img")).toHaveLength(0);
    if (project % 2 === 0) await act(async () => {
      pending.get(`timeline_preview:preview-${project}`)!({ version: 2, frames: [[255, 216], [255, 216], [255, 216]], peaks: [.25], hasAudio: true });
      pending.get(`get_editor_thumbnail:preview-${project}`)!([255, 216, 255, 217]);
    });
  }
  await mounted.render(<Previews />);
  await act(async () => {
    for (let project = 1; project < 10; project += 2) {
      pending.get(`timeline_preview:preview-${project}`)!({ version: 2, frames: [[255, 216]], peaks: [], hasAudio: false });
      pending.get(`get_editor_thumbnail:preview-${project}`)!([255, 216, 255, 217]);
    }
  });
  expect(mounted.host.querySelectorAll("img")).toHaveLength(0);
  await mounted.close(); mounted = undefined;
  expect(urls.size).toBe(0);
  expect(counts).toEqual({ created: 20, revoked: 20, invalidRevoke: 0, maximum: 4, observers: 10, closedObservers: 10, nativePending: 0 });
  expect(invoke).toHaveBeenCalledTimes(20);
  console.info("M5_PREVIEW_URLS", JSON.stringify({ projects: 10, ...counts, liveUrls: urls.size, nativeCalls: vi.mocked(invoke).mock.calls.length }));
});
