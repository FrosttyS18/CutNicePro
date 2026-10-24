/**
 * FrameSeeker — decodifica frames individuais via WebCodecs (mediabunny)
 * para scrub instantâneo na timeline. Inspirado no VideoCache do OpenCut
 * Classic (rev cf5e79e, services/video-cache/service.ts, MIT).
 *
 * O elemento <video> precisa decodar TODOS os frames do keyframe até o
 * alvo (60-300 frames por seek em H.264 1080p) — o FrameSeeker usa o
 * demuxer do mediabunny para posicionar no frame exato e decodificar
 * apenas esse. Canvas resultado é desenhado por cima do <video> durante
 * o arrasto; o vídeo continua para playback/áudio/exportação.
 */
import { Input, ALL_FORMATS, BlobSource, CanvasSink, type WrappedCanvas } from "mediabunny";

/** Sem pool, o mediabunny cria HTMLCanvasElement no main thread; OffscreenCanvas cobre o tipo union da lib. */
export type ScrubCanvas = HTMLCanvasElement | OffscreenCanvas;

interface SinkData {
  input: Input;
  sink: CanvasSink;
  iterator: AsyncGenerator<WrappedCanvas, void, unknown> | null;
  currentFrame: WrappedCanvas | null;
  nextFrame: WrappedCanvas | null;
  lastTime: number;
  prefetching: boolean;
  prefetchPromise: Promise<void> | null;
}

export class FrameSeeker {
  private sinks = new Map<string, SinkData>();
  private initPromises = new Map<string, Promise<void>>();
  private frameChain = new Map<string, Promise<unknown>>();
  private seekGenerations = new Map<string, number>();

  /** Decodifica o frame no tempo pedido; só o pedido MAIS RECENTE vence. */
  async getFrameAt(mediaId: string, blob: Blob, time: number): Promise<ScrubCanvas | null> {
    await this.#ensureSink(mediaId, blob);
    const data = this.sinks.get(mediaId);
    if (!data) return null;

    const generation = (this.seekGenerations.get(mediaId) ?? 0) + 1;
    this.seekGenerations.set(mediaId, generation);

    // encadeia: só processa se for o pedido mais recente
    const previous = this.frameChain.get(mediaId) ?? Promise.resolve();
    const current = previous.then(() => {
      if (this.seekGenerations.get(mediaId) !== generation) {
        return data.currentFrame?.canvas ?? null; // obsoleto → mantém atual
      }
      return this.#resolve(data, time);
    });
    this.frameChain.set(mediaId, current.catch(() => {}));
    return current;
  }

  dispose(mediaId?: string) {
    if (mediaId) {
      const data = this.sinks.get(mediaId);
      if (data) { try { data.input.dispose?.(); } catch { /* best-effort */ } this.sinks.delete(mediaId); }
      this.initPromises.delete(mediaId);
      this.frameChain.delete(mediaId);
      this.seekGenerations.delete(mediaId);
    } else {
      for (const data of this.sinks.values()) { try { data.input.dispose?.(); } catch { /* best-effort */ } }
      this.sinks.clear(); this.initPromises.clear(); this.frameChain.clear(); this.seekGenerations.clear();
    }
  }

  async #ensureSink(mediaId: string, blob: Blob): Promise<void> {
    if (this.sinks.has(mediaId)) return;
    let init = this.initPromises.get(mediaId);
    if (!init) {
      init = (async () => {
        const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error("sem faixa de vídeo");
        const sink = new CanvasSink(track);
        this.sinks.set(mediaId, { input, sink, iterator: null, currentFrame: null, nextFrame: null, lastTime: -Infinity, prefetching: false, prefetchPromise: null });
      })();
      this.initPromises.set(mediaId, init);
    }
    await init;
  }

  async #resolve(data: SinkData, time: number): Promise<ScrubCanvas | null> {
    // 1) frame atual é válido?
    if (data.currentFrame && this.#isValid(data.currentFrame, time)) {
      this.#startPrefetch(data);
      return data.currentFrame.canvas;
    }
    // 2) nextFrame (prefetch) é válido?
    if (data.nextFrame && data.nextFrame.timestamp <= time * 1e6) {
      data.currentFrame = data.nextFrame; data.nextFrame = null;
      this.#startPrefetch(data);
      if (this.#isValid(data.currentFrame, time)) return data.currentFrame.canvas;
    }
    // 3) busca sequencial (próximo, <2s à frente) — mais rápido que re-seek
    if (data.iterator && data.currentFrame && time >= data.lastTime && time < data.lastTime + 2.0) {
      const frame = await this.#iterateTo(data, time);
      if (frame) { this.#startPrefetch(data); return frame.canvas; }
    }
    // 4) seek completo (salto distante)
    const frame = await this.#seekTo(data, time);
    if (frame) this.#startPrefetch(data);
    return frame?.canvas ?? null;
  }

  #isValid(frame: WrappedCanvas, time: number): boolean {
    const ts = frame.timestamp / 1e6; // µs → s
    return time >= ts && time < ts + (frame.duration ?? 33_000) / 1e6;
  }

  async #iterateTo(data: SinkData, targetTime: number): Promise<WrappedCanvas | null> {
    if (!data.iterator) return null;
    try {
      for (;;) {
        if (data.prefetching && data.prefetchPromise) await data.prefetchPromise;
        if (data.nextFrame && data.nextFrame.timestamp <= targetTime * 1e6 + 50_000) {
          data.currentFrame = data.nextFrame; data.nextFrame = null;
        } else {
          const { value: frame, done } = await data.iterator.next();
          if (done || !frame) break;
          data.currentFrame = frame;
        }
        if (!data.currentFrame) break;
        data.lastTime = data.currentFrame.timestamp / 1e6;
        if (this.#isValid(data.currentFrame, targetTime)) return data.currentFrame;
        if (data.currentFrame.timestamp / 1e6 > targetTime + 1.0) break;
      }
    } catch { data.iterator = null; }
    return null;
  }

  async #seekTo(data: SinkData, time: number): Promise<WrappedCanvas | null> {
    try {
      data.iterator = data.sink.canvases(time);
      const { value: frame } = await data.iterator.next();
      if (frame) { data.currentFrame = frame; data.lastTime = frame.timestamp / 1e6; }
      return frame ?? null;
    } catch { data.iterator = null; return null; }
  }

  #startPrefetch(data: SinkData) {
    if (data.prefetching || data.nextFrame || !data.iterator) return;
    data.prefetching = true;
    data.prefetchPromise = data.iterator.next().then(({ value: frame }) => {
      data.nextFrame = frame ?? null;
    }).catch(() => {}).finally(() => { data.prefetching = false; });
  }
}
