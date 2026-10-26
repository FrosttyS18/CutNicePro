import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WrappedCanvas } from "mediabunny";
import { FrameSeeker } from "../lib/frame-seeker";

const decoder = vi.hoisted(() => ({
  starts: [] as number[], reads: 0, closed: 0, disposed: 0, created: 0,
  gate: null as Promise<void> | null,
  readGate: null as Promise<void> | null,
  trackGate: null as Promise<void> | null,
}));
vi.mock("mediabunny", () => ({
  ALL_FORMATS: [], BlobSource: class {}, UrlSource: class {},
  Input: class {
    constructor() { decoder.created++; }
    async getPrimaryVideoTrack() {
      await decoder.trackGate;
      return { displayWidth: 1920, displayHeight: 1080 };
    }
    dispose() { decoder.disposed++; }
  },
  CanvasSink: class {
    async *canvases(start: number) {
      decoder.starts.push(start);
      const gate = decoder.gate;
      decoder.gate = null;
      try {
        for (let index = 0; index < 200; index++) {
          decoder.reads++;
          if (index === 0) await gate;
          if (decoder.readGate) {
            const readGate = decoder.readGate;
            decoder.readGate = null;
            await readGate;
          }
          const timestamp = Math.floor((start + 1e-8) / 0.04) * 0.04 + index * 0.04;
          yield { canvas: { timestamp } as unknown as HTMLCanvasElement, timestamp, duration: 0.04 } satisfies WrappedCanvas;
        }
      } finally { decoder.closed++; }
    }
  },
}));
const instances: FrameSeeker[] = [];
const source = new Blob(["fixture"]);
function seeker() {
  const value = new FrameSeeker();
  instances.push(value);
  return value;
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
beforeEach(() => {
  decoder.starts = [];
  decoder.reads = decoder.closed = decoder.disposed = decoder.created = 0;
  decoder.gate = decoder.readGate = decoder.trackGate = null;
});
afterEach(() => { instances.splice(0).forEach(value => value.dispose()); });

describe("FrameSeeker: tempo e ciclo de vida", () => {
  it("reutiliza um frame em segundos em um timestamp diferente de zero", async () => {
    const value = seeker();
    const first = await value.getFrameAt("media", source, 10);
    expect(await value.getFrameAt("media", source, 10.01)).toBe(first);
    expect(decoder.starts).toEqual([10]);
  });
  it("descarta uma resposta que ficou obsoleta durante a decodificação", async () => {
    const gate = deferred();
    decoder.gate = gate.promise;
    const value = seeker();
    const old = value.getFrameAt("media", source, 10);
    await vi.waitFor(() => expect(decoder.reads).toBe(1));
    const latest = value.getFrameAt("media", source, 20);
    gate.release();
    expect(await old).toBeNull();
    expect(await latest).not.toBeNull();
  });
  it.each([
    { time: 20, reads: 3, starts: [10, 20] },
    { time: 10.04, reads: 2, starts: [10] },
  ])("interrompe o avanço obsoleto para atender $time sem recriar a fonte", async ({ time, reads, starts }) => {
    const value = seeker();
    await value.getFrameAt("media", source, 10);
    const gate = deferred();
    decoder.readGate = gate.promise;
    try {
      const old = value.getFrameAt("media", source, 11);
      await vi.waitFor(() => expect(decoder.reads).toBe(2));
      const latest = value.getFrameAt("media", source, time);
      gate.release();
      expect(await old).toBeNull();
      expect(await latest).toMatchObject({ timestamp: expect.closeTo(time, 8) });
      expect(decoder.reads).toBe(reads);
      expect(decoder.starts).toEqual(starts);
      expect(await value.getFrameAt("media", source, time + 0.04)).not.toBeNull();
      expect(decoder.reads).toBe(reads + 1);
      expect(decoder.starts).toEqual(starts);
      expect(decoder.created).toBe(1);
      expect(decoder.disposed).toBe(0);
    } finally { gate.release(); }
  });
  it("não registra decodificador inicializado após dispose", async () => {
    const gate = deferred();
    decoder.trackGate = gate.promise;
    const value = seeker();
    const pending = value.getFrameAt("media", source, 10);
    value.dispose();
    gate.release();
    expect(await pending).toBeNull();
    expect(decoder.disposed).toBe(1);
  });
  it("encerra o iterador anterior ao saltar para outro ponto", async () => {
    const value = seeker();
    await value.getFrameAt("media", source, 10);
    await value.getFrameAt("media", source, 40);
    expect(decoder.closed).toBeGreaterThanOrEqual(1);
  });
});
