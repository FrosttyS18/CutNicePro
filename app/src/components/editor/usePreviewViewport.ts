import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { boundPreviewCamera, centerPreviewAt, FIT_PREVIEW, zoomPreviewAt, type PreviewCamera, type PreviewPoint, type PreviewSize } from "../../lib/preview-viewport";

interface Props { canvasRef: RefObject<HTMLDivElement | null>; output: PreviewSize; onViewChange: () => void }
export function usePreviewViewport({ canvasRef, output, onViewChange }: Props) {
  const [camera, setCamera] = useState<PreviewCamera>({ ...FIT_PREVIEW });
  const [size, setSize] = useState<PreviewSize>({ width: 0, height: 0 });
  const [panning, setPanning] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  const current = useRef({ camera, size, output, onViewChange });
  useLayoutEffect(() => { current.current = { camera, size, output, onViewChange }; });
  const change = useCallback((next: PreviewCamera) => {
    const previous = current.current.camera;
    if (previous.zoom === next.zoom && previous.x === next.x && previous.y === next.y) return;
    current.current.onViewChange(); current.current.camera = next; setCamera(next);
  }, []);
  const reset = useCallback(() => { cleanup.current?.(); change({ ...FIT_PREVIEW }); }, [change]);
  const zoom = useCallback((next: number, point?: PreviewPoint) => {
    cleanup.current?.();
    const { camera, size, output } = current.current;
    change(zoomPreviewAt(size, output, camera, next, point ?? { x: size.width / 2, y: size.height / 2 }));
  }, [change]);
  useLayoutEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const next = { width: rect.width, height: rect.height };
      const { size, camera, output } = current.current;
      if (next.width === size.width && next.height === size.height) return;
      cleanup.current?.(); current.current.size = next; setSize(next);
      change(boundPreviewCamera(next, output, camera));
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element); window.addEventListener("resize", measure); measure();
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [canvasRef, change]);
  useEffect(() => { reset(); }, [output.width, output.height, reset]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !Number.isFinite(event.deltaY)) return;
      event.preventDefault(); event.stopPropagation();
      const rect = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      zoom(current.current.camera.zoom * Math.exp(Math.max(-4, Math.min(4, -delta * .002))), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { element.removeEventListener("wheel", wheel); };
  }, [canvasRef, zoom]);
  useEffect(() => () => cleanup.current?.(), []);

  const begin = (event: ReactPointerEvent<HTMLElement>, overview = false) => {
    event.preventDefault(); event.stopPropagation(); cleanup.current?.();
    const initial = { ...current.current.camera }, x = event.clientX, y = event.clientY;
    const rect = event.currentTarget.getBoundingClientRect(), pointerId = event.pointerId;
    let request = 0, latest = { x, y }, ended = false;
    const update = () => {
      request = 0; if (ended) return;
      const { size, output } = current.current;
      change(overview ? centerPreviewAt(size, output, current.current.camera, {
        x: rect.width ? (latest.x - rect.left) / rect.width : .5, y: rect.height ? (latest.y - rect.top) / rect.height : .5,
      }) : boundPreviewCamera(size, output, { ...initial, x: initial.x + latest.x - x, y: initial.y + latest.y - y }));
    };
    const matching = (value: PointerEvent) => value.pointerId === undefined || value.pointerId === pointerId;
    const move = (value: PointerEvent) => { if (!matching(value)) return; latest = { x: value.clientX, y: value.clientY }; if (!request) request = window.requestAnimationFrame(update); };
    const stop = () => {
      ended = true; window.cancelAnimationFrame(request); setPanning(false); cleanup.current = null;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", key);
    };
    const cancel = () => { stop(); change(initial); };
    const up = (value: PointerEvent) => { if (!matching(value)) return; latest = { x: value.clientX, y: value.clientY }; window.cancelAnimationFrame(request); update(); stop(); };
    const key = (value: KeyboardEvent) => { if (value.key === "Escape") { value.preventDefault(); value.stopImmediatePropagation(); cancel(); } };
    current.current.onViewChange(); setPanning(true);
    if (overview) update();
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel); window.addEventListener("keydown", key);
    cleanup.current = cancel;
  };
  const shift = (x: number, y: number) => {
    const { camera, size, output } = current.current;
    change(boundPreviewCamera(size, output, { ...camera, x: camera.x + x, y: camera.y + y }));
  };
  return { camera, size, panning, zoom, reset, begin, shift };
}
