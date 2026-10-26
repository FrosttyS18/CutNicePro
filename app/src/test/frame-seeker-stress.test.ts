import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FrameSeeker } from "../lib/frame-seeker";

const counters = vi.hoisted(() => ({ created: 0, disposed: 0, live: 0, maximum: 0, iteratorCreated: 0, iteratorClosed: 0, iteratorLive: 0, reads: 0, doubleDispose: 0,
  trackGate: null as Promise<void> | null, frameGate: null as Promise<void> | null }));
vi.mock("mediabunny", () => ({
  ALL_FORMATS: [], BlobSource: class {}, UrlSource: class {},
  Input: class {
    private closed = false;
    private gate = counters.trackGate;
    constructor() { counters.created += 1; counters.live += 1; counters.maximum = Math.max(counters.maximum, counters.live); }
    async getPrimaryVideoTrack() { await this.gate; return { displayWidth: 1920, displayHeight: 1080 }; }
    dispose() { if (this.closed) { counters.doubleDispose += 1; return; } this.closed = true; counters.disposed += 1; counters.live -= 1; }
  },
  CanvasSink: class {
    async *canvases(start: number) {
      counters.iteratorCreated += 1; counters.iteratorLive += 1;
      const gate = counters.frameGate; counters.frameGate = null;
      try {
        await gate;
        for (let index = 0; index < 250; index += 1) {
          counters.reads += 1;
          yield { canvas: { width: 0, height: 0, timestamp: start + index / 25 }, timestamp: start + index / 25, duration: 1 / 25 };
        }
      } finally { counters.iteratorLive -= 1; counters.iteratorClosed += 1; }
    }
  },
}));
const instances: FrameSeeker[] = [];
const releases: (() => void)[] = [];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(release => { resolve = release; });
  releases.push(resolve);
  return { promise, resolve };
}
function seeker() { const value = new FrameSeeker(); instances.push(value); return value; }
beforeEach(() => {
  Object.assign(counters, { created: 0, disposed: 0, live: 0, maximum: 0, iteratorCreated: 0, iteratorClosed: 0, iteratorLive: 0, reads: 0, doubleDispose: 0, trackGate: null, frameGate: null });
});
afterEach(async () => {
  instances.splice(0).forEach(instance => instance.dispose());
  releases.splice(0).forEach(release => release());
  await Promise.resolve(); await Promise.resolve();
});

it("200 seeks em 10 mídias mantêm cache limitado e fecham todos os iteradores", async () => {
  const value = seeker();
  let responses = 0;
  for (let project = 0; project < 10; project += 1) {
    for (let seek = 0; seek < 20; seek += 1) {
      if (await value.getFrameAt(`p${project}`, `fixture:${project}`, (seek * 97) % 120)) responses += 1;
    }
    expect(counters.live).toBeLessThanOrEqual(2);
  }
  value.dispose(); await Promise.resolve();
  expect(responses).toBe(200);
  expect(counters).toMatchObject({ created: 10, disposed: 10, live: 0, maximum: 3, iteratorCreated: 200, iteratorClosed: 200, iteratorLive: 0, doubleDispose: 0 });
  console.info("M5_FRAME_SEEKER", JSON.stringify({ responses, ...counters, trackGate: undefined, frameGate: undefined }));
});

it("dispose libera imediatamente inicializações pendentes em 10 trocas", async () => {
  const pending: Promise<unknown>[] = [];
  try {
    for (let project = 0; project < 10; project += 1) {
      const gate = deferred(); counters.trackGate = gate.promise;
      const value = seeker();
      pending.push(value.getFrameAt(`pending-${project}`, `fixture:${project}`, 0));
      value.dispose();
      expect(counters.live).toBe(0);
    }
  } finally { releases.forEach(release => release()); await Promise.all(pending); }
  expect(counters).toMatchObject({ created: 10, disposed: 10, live: 0, iteratorCreated: 0, iteratorLive: 0, doubleDispose: 0 });
  console.info("M5_PENDING_INIT", JSON.stringify({ created: counters.created, disposed: counters.disposed, live: counters.live, doubleDispose: counters.doubleDispose }));
});

it("200 pedidos concorrentes do mesmo vídeo só publicam o seek mais recente", async () => {
  const gate = deferred(); counters.frameGate = gate.promise;
  const value = seeker();
  const first = value.getFrameAt("shared", "fixture:shared", 1);
  await vi.waitFor(() => expect(counters.iteratorLive).toBe(1));
  const rest = Array.from({ length: 199 }, (_, index) => value.getFrameAt("shared", "fixture:shared", index + 2));
  gate.resolve();
  const results = await Promise.all([first, ...rest]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(results[199]).not.toBeNull();
  value.dispose(); await Promise.resolve();
  expect(counters).toMatchObject({ created: 1, disposed: 1, live: 0, iteratorLive: 0, doubleDispose: 0 });
  console.info("M5_SUPERSEDED_SEEKS", JSON.stringify({ requested: results.length, published: results.filter(Boolean).length, created: counters.created, disposed: counters.disposed, iteratorCreated: counters.iteratorCreated, iteratorClosed: counters.iteratorClosed }));
});
