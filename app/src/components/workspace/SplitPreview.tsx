import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import type { SplitScreenSettings } from "../../lib/workspace-types";
import type { ScrubCanvas } from "../../lib/frame-seeker";
import { splitLayoutAt, splitPanelGeometry } from "../../lib/split-screen";
import "./split-preview.css";

interface Props {
  video: RefObject<HTMLVideoElement | null>;
  layout: SplitScreenSettings;
  localUrl: string;
  filter?: string;
  scrub?: ScrubCanvas | null;
  scrubTime?: number;
}

export function SplitPreview({ video, layout, localUrl, filter, scrub, scrubTime }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = video.current;
    const target = canvas.current;
    const context = target?.getContext("2d");
    if (!element || !target || !context) return;
    let request: number | null = null;
    let nativeFrame = false;
    let disposed = false;
    const stop = () => {
      if (request === null) return;
      if (nativeFrame) element.cancelVideoFrameCallback(request);
      else cancelAnimationFrame(request);
      request = null;
    };
    const paintAt = (sourceTime: number) => {
      if (disposed || (!scrub && element.readyState < 2)) return;
      const width = scrub?.width ?? element.videoWidth;
      const height = scrub?.height ?? element.videoHeight;
      if (width < 2 || height < 2) return;
      context.clearRect(0, 0, target.width, target.height);
      const active = splitLayoutAt(layout, scrub && scrubTime !== undefined ? scrubTime : sourceTime);
      target.dataset.mode = active ? "split" : "single";
      if (!active) return;
      [active.top, active.bottom].forEach((panel, index) => {
        const geometry = splitPanelGeometry(width, height, panel);
        context.drawImage(scrub ?? element, geometry.sourceX, geometry.sourceY,
          geometry.sourceWidth, geometry.sourceHeight, 0, index * target.height / 2,
          target.width, target.height / 2);
      });
    };
    const paint = () => paintAt(element.currentTime);
    const next = () => {
      if (disposed || element.paused) return;
      nativeFrame = typeof element.requestVideoFrameCallback === "function";
      request = nativeFrame ? element.requestVideoFrameCallback((_now, metadata) => { request = null; paintAt(metadata.mediaTime); next(); })
        : requestAnimationFrame(() => { request = null; paint(); next(); });
    };
    const play = () => { stop(); paint(); next(); };
    const pause = () => { stop(); paint(); };
    element.addEventListener("loadeddata", paint);
    element.addEventListener("seeked", paint);
    element.addEventListener("resize", paint);
    element.addEventListener("play", play);
    element.addEventListener("pause", pause);
    paint();
    next();
    return () => {
      disposed = true;
      stop();
      element.removeEventListener("loadeddata", paint);
      element.removeEventListener("seeked", paint);
      element.removeEventListener("resize", paint);
      element.removeEventListener("play", play);
      element.removeEventListener("pause", pause);
    };
  }, [video, localUrl, layout, scrub, scrubTime]);
  return <canvas ref={canvas} width={540} height={960} className="split-preview" data-mode="single"
    style={{ filter } as CSSProperties} role="img" aria-label={layout.shots ? "Prévia com composição por cena" : "Prévia com dois painéis empilhados"}/>;
}
