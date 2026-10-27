import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { secondsToFrame } from "../../lib/composition-time";
import type { FrameRate } from "../../lib/composition-types";
import { useTimelineWheelZoom } from "./useTimelineWheelZoom";

interface Viewport { width: number; contentWidth: number; left: number }
const limit = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const widthLimit = (width: number, frames: number) => Math.max(width, Math.min(16_000_000, Math.max(width * 16, frames * 20)));

export function useSourceRangeZoom(target: RefObject<HTMLDivElement | null>, duration: number, fps: FrameRate, canZoom: () => boolean) {
  const [view, setView] = useState<Viewport>({ width: 0, contentWidth: 0, left: 0 });
  const current = useRef(view);
  const frameCount = secondsToFrame(duration, fps);
  const update = (next: Viewport) => {
    current.current = next;
    setView(next);
  };

  useLayoutEffect(() => {
    const element = target.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth || element.getBoundingClientRect().width;
      if (!Number.isFinite(width) || width <= 0) return;
      const previous = current.current;
      const ratio = previous.width > 0 ? previous.contentWidth / previous.width : 1;
      const center = previous.contentWidth > 0 ? (previous.left + previous.width / 2) / previous.contentWidth : .5;
      const contentWidth = limit(width * ratio, width, widthLimit(width, frameCount));
      const left = limit(center * contentWidth - width / 2, 0, contentWidth - width);
      if (previous.width !== width || previous.contentWidth !== contentWidth || previous.left !== left) {
        current.current = { width, contentWidth, left };
        setView(current.current);
      }
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [target, frameCount]);

  useLayoutEffect(() => {
    const element = target.current;
    element?.scrollTo({ left: view.left, behavior: "instant" });
  }, [target, view]);

  useTimelineWheelZoom(target, (direction, pointer) => {
    const element = target.current;
    if (!element || !canZoom() || duration <= 0) return;
    const bounds = element.getBoundingClientRect();
    const width = element.clientWidth || bounds.width;
    if (!Number.isFinite(width) || width <= 0) return;
    const previousWidth = Math.max(width, current.current.contentWidth);
    const anchor = limit(pointer.x - bounds.left, 0, width);
    const position = (current.current.left + anchor) / previousWidth;
    const contentWidth = limit(previousWidth * Math.pow(1.35, direction), width, widthLimit(width, frameCount));
    const left = limit(position * contentWidth - anchor, 0, contentWidth - width);
    if (contentWidth !== previousWidth) update({ width, contentWidth, left });
  });

  const onScroll = () => {
    const element = target.current;
    if (!element) return;
    const previous = current.current;
    const left = limit(element.scrollLeft, 0, Math.max(0, previous.contentWidth - previous.width));
    if (left !== previous.left) update({ ...previous, left });
  };

  return { ...view, onScroll };
}
