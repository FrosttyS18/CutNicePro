import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { frameToSeconds, secondsToFrame } from "../../lib/composition-time";
import { formatMediaTime } from "../../lib/workspace";
import type { FrameRate } from "../../lib/composition-types";
import { useSourceRangeZoom } from "./useSourceRangeZoom";

interface Props {
  duration: number;
  fps: FrameRate;
  time: number;
  start: number;
  end: number;
  frames?: string[];
  kind: "video" | "audio";
  disabled: boolean;
  onSeek: (seconds: number) => void;
  onRange: (start: number, end: number) => void;
  onActivate: () => void;
}

export function CompositionSourceRange({ duration, fps, time, start, end, frames = [], kind, disabled, onSeek, onRange, onActivate }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const view = useSourceRangeZoom(viewport, duration, fps, () => !disabled && !cleanup.current);
  const step = Math.min(duration, frameToSeconds(1, fps));
  const clamp = (value: number) => Math.max(0, Math.min(duration, value));
  const percent = (value: number) => duration > 0 ? 100 * clamp(value) / duration : 0;
  useEffect(() => { if (disabled) cleanup.current?.(); }, [disabled]);
  useEffect(() => () => cleanup.current?.(), [duration, fps.numerator, fps.denominator]);
  const zoomed = view.width > 0 && view.contentWidth > view.width + 1;
  const firstTile = Math.max(0, Math.floor(view.left / 84) - 1);
  const lastTile = Math.min(Math.ceil(view.contentWidth / 84), Math.ceil((view.left + view.width) / 84) + 1);
  const tiles = zoomed ? Array.from({ length: Math.max(0, lastTile - firstTile) }, (_, index) => firstTile + index) : [];

  const begin = (event: PointerEvent<HTMLElement>, edge?: "start" | "end") => {
    if (event.button !== 0 || disabled || duration <= 0) return;
    const bounds = surface.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    event.preventDefault(); event.stopPropagation();
    cleanup.current?.();
    event.currentTarget.focus({ preventScroll: true });
    onActivate();
    const originX = event.clientX;
    const pointerId = event.pointerId;
    const matches = (next: globalThis.PointerEvent) => !Number.isFinite(pointerId) || next.pointerId === pointerId;
    const at = (clientX: number) => {
      const measured = surface.current?.getBoundingClientRect();
      const geometry = measured?.width ? measured : bounds;
      return clamp(frameToSeconds(secondsToFrame(clamp((clientX - geometry.left) / geometry.width * duration), fps), fps));
    };
    const anchor = at(originX);
    let dragged = false;
    const update = (clientX: number) => {
      const value = at(clientX);
      dragged ||= Math.abs(clientX - originX) >= 3;
      if (edge === "start") onRange(Math.max(0, Math.min(value, end - step)), end);
      else if (edge === "end") onRange(start, Math.min(duration, Math.max(value, start + step)));
      else if (dragged) {
        const left = Math.min(anchor, value);
        const right = Math.max(anchor, value);
        onRange(Math.min(left, duration - step), Math.max(right, Math.min(duration, left + step)));
      }
      onSeek(value);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      cleanup.current = null;
    };
    const cancel = () => { stop(); onRange(start, end); onSeek(time); };
    const move = (next: globalThis.PointerEvent) => { if (matches(next)) update(next.clientX); };
    const up = (next: globalThis.PointerEvent) => { if (matches(next)) { update(next.clientX); stop(); } };
    const key = (next: globalThis.KeyboardEvent) => {
      if (next.key === "Escape") { next.preventDefault(); next.stopImmediatePropagation(); cancel(); }
      else if(next.key==="Enter"){next.preventDefault();next.stopImmediatePropagation();}
    };
    onSeek(edge === "start" ? start : edge === "end" ? end : anchor);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    cleanup.current = stop;
  };

  const adjust = (event: KeyboardEvent<HTMLElement>, edge: "start" | "end") => {
    if (disabled || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault(); event.stopPropagation();
    const current = edge === "start" ? start : end;
    const minimum = edge === "start" ? 0 : start + step;
    const maximum = edge === "start" ? end - step : duration;
    const next = event.key === "Home" ? minimum : event.key === "End" ? maximum : current + (event.key === "ArrowLeft" ? -1 : 1) * step * (event.shiftKey ? 10 : 1);
    const value = Math.max(minimum, Math.min(maximum, next));
    if (edge === "start") onRange(value, end); else onRange(start, value);
  };

  return <div className="composition-source-range" data-kind={kind} data-disabled={disabled || undefined}>
    <div ref={viewport} className="composition-source-range__viewport" onScroll={view.onScroll}>
    <div className="composition-source-range__content" style={{ width: view.contentWidth || "100%" }}>
    <div ref={surface} className="composition-source-range__track" style={{ width: view.contentWidth || "100%" }} role="slider" tabIndex={0} aria-label="Posição na fonte"
      aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} aria-valuetext={formatMediaTime(time)} aria-disabled={disabled}
      onPointerDown={event => begin(event)}>
      <div className="composition-source-range__frames" data-zoomed={zoomed || undefined} aria-hidden="true">
        {kind === "video" && frames.length ? zoomed ? tiles.map(tile => <img key={tile}
          src={frames[Math.min(frames.length - 1, Math.floor(tile * 84 / view.contentWidth * frames.length))]}
          style={{ left: tile * 84, width: Math.min(84, view.contentWidth - tile * 84) }} alt="" draggable={false}/>)
          : frames.map((frame, index) => <img key={`${index}:${frame}`} src={frame} alt="" draggable={false}/>)
          : <span className="composition-source-range__empty">{kind === "audio" ? "Áudio · arraste para selecionar" : "Miniaturas indisponíveis · arraste para selecionar"}</span>}
      </div>
      <span className="composition-source-range__selection" aria-hidden="true" style={{ left: `${percent(start)}%`, width: `${percent(end - start)}%` }}/>
      <span className="composition-source-range__cursor" aria-hidden="true" style={{ left: `${percent(time)}%` }}/>
    </div>
    {(["start", "end"] as const).map(edge => <div key={edge} className={`composition-source-range__handle composition-source-range__handle--${edge}`}
      role="slider" tabIndex={0} aria-label={edge === "start" ? "Ajustar início na fonte" : "Ajustar fim na fonte"} aria-disabled={disabled}
      aria-valuemin={edge === "start" ? 0 : start + step} aria-valuemax={edge === "start" ? end - step : duration}
      aria-valuenow={edge === "start" ? start : end} aria-valuetext={formatMediaTime(edge === "start" ? start : end)}
      style={{ left: `${percent(edge === "start" ? start : end)}%` }} onPointerDown={event => begin(event, edge)} onKeyDown={event => adjust(event, edge)}/>)}
    </div></div>
    <div className="composition-source-range__ruler" aria-hidden="true"><span>{formatMediaTime(view.contentWidth ? duration * view.left / view.contentWidth : 0)}</span>
      <span>{formatMediaTime(view.contentWidth ? Math.min(duration, duration * (view.left + view.width) / view.contentWidth) : duration)}</span></div>
  </div>;
}
