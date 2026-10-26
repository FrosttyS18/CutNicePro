import { Input, ALL_FORMATS, BlobSource, UrlSource, CanvasSink, type WrappedCanvas } from "mediabunny";

export type ScrubCanvas = HTMLCanvasElement | OffscreenCanvas;
type MediaInput = Blob | string;
interface SinkData {
  source: MediaInput;
  input: Input;
  sink: CanvasSink;
  iterator: AsyncGenerator<WrappedCanvas, void, unknown> | null;
  frame: WrappedCanvas | null;
  chain: Promise<unknown>;
  closed: boolean;
}
interface PendingSink {
  source: MediaInput;
  input: Input | null;
  promise: Promise<SinkData | null>;
}

export class FrameSeeker {
  private sinks = new Map<string, SinkData>();
  private pending = new Map<string, PendingSink>();
  private requests = new Map<string, number>();
  private sequence = 0;
  private disposed = false;

  async getFrameAt(mediaId: string, source: MediaInput, time: number): Promise<ScrubCanvas | null> {
    if (this.disposed || !Number.isFinite(time) || time < 0) return null;
    const previousSource = this.sinks.get(mediaId)?.source ?? this.pending.get(mediaId)?.source;
    if (previousSource !== undefined && previousSource !== source) this.dispose(mediaId);
    const request = ++this.sequence;
    this.requests.set(mediaId, request);
    const data = await this.ensureSink(mediaId, source);
    if (!data) return null;
    const current = () => !this.disposed && !data.closed && this.requests.get(mediaId) === request;
    const result = data.chain.catch(() => null).then(async () => {
      if (!current()) return null;
      const frame = await this.resolve(data, time, current);
      return current() ? frame?.canvas ?? null : null;
    });
    data.chain = result;
    return result;
  }

  dispose(mediaId?: string): void {
    if (mediaId !== undefined) {
      this.requests.delete(mediaId);
      const pending = this.pending.get(mediaId);
      if (pending?.input) { pending.input.dispose(); pending.input = null; }
      this.pending.delete(mediaId);
      const data = this.sinks.get(mediaId);
      if (data) {
        data.closed = true;
        void data.iterator?.return().catch(() => undefined);
        data.input.dispose();
        this.sinks.delete(mediaId);
      }
      return;
    }
    this.disposed = true;
    for (const id of this.sinks.keys()) this.dispose(id);
    for (const id of this.pending.keys()) this.dispose(id);
    this.requests.clear();
    this.pending.clear();
  }

  private async ensureSink(mediaId: string, source: MediaInput): Promise<SinkData | null> {
    const existing = this.sinks.get(mediaId);
    if (existing) {
      this.sinks.delete(mediaId);
      this.sinks.set(mediaId, existing);
      return existing;
    }
    const initializing = this.pending.get(mediaId);
    if (initializing) return initializing.promise;
    const slot: PendingSink = { source, input: null, promise: Promise.resolve(null) };
    this.pending.set(mediaId, slot);
    slot.promise = (async () => {
      try {
        const input = new Input({
          source: typeof source === "string"
            ? new UrlSource(source, { maxCacheSize: 16 * 1024 * 1024, parallelism: 1, getRetryDelay: attempt => attempt < 2 ? 0.2 : null })
            : new BlobSource(source),
          formats: ALL_FORMATS,
        });
        slot.input = input;
        const track = await input.getPrimaryVideoTrack();
        if (this.disposed || this.pending.get(mediaId) !== slot) {
          if (slot.input) { slot.input.dispose(); slot.input = null; }
          return null;
        }
        if (!track) throw new Error("Sem faixa de vídeo");
        const width = Math.min(track.displayWidth, Math.round(1280 * track.displayWidth / Math.max(track.displayWidth, track.displayHeight)));
        const data: SinkData = {
          source, input, sink: new CanvasSink(track, { width, poolSize: 3 }),
          iterator: null, frame: null, chain: Promise.resolve(), closed: false,
        };
        while (this.sinks.size >= 2) {
          const oldest = this.sinks.keys().next().value;
          if (oldest === undefined) break;
          this.dispose(oldest);
        }
        this.sinks.set(mediaId, data);
        slot.input = null;
        return data;
      } catch (error) {
        if (slot.input) { slot.input.dispose(); slot.input = null; }
        if (this.disposed || this.pending.get(mediaId) !== slot) return null;
        throw error;
      } finally {
        if (this.pending.get(mediaId) === slot) this.pending.delete(mediaId);
      }
    })();
    return slot.promise;
  }

  private contains(frame: WrappedCanvas, time: number): boolean {
    return time + 1e-8 >= frame.timestamp && time < frame.timestamp + frame.duration - 1e-8;
  }

  private async resolve(data: SinkData, time: number, current: () => boolean): Promise<WrappedCanvas | null> {
    if (data.frame && this.contains(data.frame, time)) return data.frame;
    try {
      if (data.iterator && data.frame && time >= data.frame.timestamp && time < data.frame.timestamp + 2) {
        for (let count = 0; count < 240; count++) {
          const { value, done } = await data.iterator.next();
          if (done || data.closed) break;
          data.frame = value;
          if (!current()) return null;
          if (this.contains(value, time)) return value;
          if (value.timestamp > time) break;
        }
      }
      await data.iterator?.return();
      if (!current()) return null;
      data.iterator = data.sink.canvases(time);
      const { value, done } = await data.iterator.next();
      data.frame = !done && !data.closed ? value : null;
      return data.frame;
    } catch {
      await data.iterator?.return().catch(() => undefined);
      data.iterator = null;
      data.frame = null;
      return null;
    }
  }
}
