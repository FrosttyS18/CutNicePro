import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WrappedCanvas } from "mediabunny";
import { FrameSeeker } from "../lib/frame-seeker";

const decoder = vi.hoisted(() => ({
  starts: [] as number[], reads: 0, closed: 0, disposed: 0,
  gate: null as Promise<void> | null,
  trackGate: null as Promise<void> | null,
}));
vi.mock("mediabunny", () => ({
  ALL_FORMATS: [], BlobSource: class {}, UrlSource: class {},
  Input: class {
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
  decoder.reads = decoder.closed = decoder.disposed = 0;
  decoder.gate = decoder.trackGate = null;
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
