import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import "./composition-panel-resize.css";

interface Props {
  value: number;
  onChange: (value: number) => void;
  containerRef: RefObject<HTMLElement | null>;
}
interface Bounds { minimum: number; maximum: number }
function limits(container: HTMLElement | null): Bounds {
  const height = container?.getBoundingClientRect().height || container?.clientHeight || (typeof window === "undefined" ? 800 : window.innerHeight);
  const maximum = Math.max(80, Math.min(520, Math.floor(height - 300)));
  return { minimum: Math.min(180, maximum), maximum };
}
function clamp(value: number, bounds: Bounds): number {
  return Math.max(bounds.minimum, Math.min(bounds.maximum, Math.round(Number.isFinite(value) ? value : bounds.minimum)));
}

export function CompositionPanelResize({ value, onChange, containerRef }: Props) {
  const description = useId();
  const latest = useRef({ value, onChange, containerRef });
  const cleanup = useRef<(() => void) | null>(null);
  const [bounds, setBounds] = useState(() => limits(null));
  useLayoutEffect(() => { latest.current = { value, onChange, containerRef }; }, [value, onChange, containerRef]);
  useEffect(() => {
    const measure = () => {
      const next = limits(containerRef.current);
      setBounds(current => current.minimum === next.minimum && current.maximum === next.maximum ? current : next);
      const height = clamp(latest.current.value, next);
      if (height !== latest.current.value) latest.current.onChange(height);
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (containerRef.current) observer?.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); cleanup.current?.(); };
  }, [containerRef]);

  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    cleanup.current?.();
    const start = clamp(latest.current.value, limits(containerRef.current));
    const startY = event.clientY;
    let y = startY;
    let frame: number | null = null;
    const update = () => latest.current.onChange(clamp(start + startY - y, limits(latest.current.containerRef.current)));
    const move = (next: globalThis.PointerEvent) => {
      y = next.clientY;
      if (frame === null) frame = window.requestAnimationFrame(() => { frame = null; update(); });
    };
    const stop = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      cleanup.current = null;
    };
    const up = (next: globalThis.PointerEvent) => { y = next.clientY; stop(); update(); };
    const cancel = () => { stop(); latest.current.onChange(clamp(start, limits(latest.current.containerRef.current))); };
    const key = (next: globalThis.KeyboardEvent) => {
      if (next.key !== "Escape") return;
      next.preventDefault(); next.stopImmediatePropagation(); cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    cleanup.current = stop;
  };

  return <div className="composition-panel-resize" role="separator" tabIndex={0} aria-label="Redimensionar altura da timeline" aria-orientation="horizontal"
    aria-valuemin={bounds.minimum} aria-valuemax={bounds.maximum} aria-valuenow={clamp(value, bounds)} aria-valuetext={`${clamp(value, bounds)} pixels`} aria-describedby={description}
    onPointerDown={begin} onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const current = latest.current;
      const range = limits(current.containerRef.current);
      const step = event.shiftKey ? 50 : 10;
      const next = event.key === "Home" ? range.minimum : event.key === "End" ? range.maximum
        : event.key === "ArrowUp" ? current.value + step : event.key === "ArrowDown" ? current.value - step : null;
      if (next === null) return;
      event.preventDefault(); event.stopPropagation(); current.onChange(clamp(next, range));
    }}><span id={description} className="sr-only">Arraste para ajustar. Use seta para cima ou para baixo; Home e End ajustam aos limites. Escape cancela o arrasto.</span></div>;
}
