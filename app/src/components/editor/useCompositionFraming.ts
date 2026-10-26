import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { linkedSelection } from "../../lib/composition-operations";
import { splitLayoutAt, splitPanelGeometry, updateSplitPanel } from "../../lib/split-screen";
import { compositionOutputSize, DEFAULT_PLACEMENT } from "../../lib/composition-placement";
import { compositionMediaGeometry, focalPointAfterDrag, resizeCompositionPlacement, type CompositionFramingAction } from "../../lib/composition-media-geometry";
import type { Composition, CompositionItem } from "../../lib/composition-types";

export type { CompositionFramingAction } from "../../lib/composition-media-geometry";

interface Props {
  document: Composition; item: CompositionItem | undefined; time: number; enabled: boolean; mode?: "crop" | "placement";
  frame?: number; playing?: boolean; selectionKey?: string; onPause?: () => void; stageRef?: RefObject<HTMLElement | null>;
  onPreview: (next: Composition | null) => void; onChange: (next: Composition) => void; onError: (message: string) => void;
}

export function useCompositionFraming(props: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const track = props.document.tracks.find(value => value.id === props.item?.trackId);
  useEffect(() => { cleanup.current?.(); }, [props.item?.id, props.frame, props.time, props.enabled, props.mode, props.selectionKey, props.document.revision, track?.locked, track?.hidden]);
  useEffect(() => { if (props.playing) cleanup.current?.(); }, [props.playing]);
  useEffect(() => () => cleanup.current?.(), []);

  return (event: ReactPointerEvent<HTMLElement>, action: CompositionFramingAction = "move") => {
    const current = latest.current;
    const item = current.item;
    if (!current.enabled || !item || event.button !== 0 || cleanup.current || !(item.kind === "video" || item.kind === "image")) return;
    const selectedTrack = current.document.tracks.find(value => value.id === item.trackId);
    if (!selectedTrack || selectedTrack.hidden || current.frame !== undefined && (current.frame < item.startFrame || current.frame >= item.startFrame + item.durationFrames)) return;
    const origin = event.target as Element;
    const hit = origin.closest?.("[data-composition-selection],[data-composition-layer]");
    if ((hit?.getAttribute("data-composition-selection") ?? hit?.getAttribute("data-composition-layer")) !== item.id) return;
    const scope = current.stageRef?.current ?? event.currentTarget;
    const stage = scope.matches(".composition-stage") ? scope : scope.querySelector<HTMLElement>(".composition-stage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const crop = action === "move" && current.mode !== "placement";
    const ids = new Set(crop ? linkedSelection(current.document, [item.id]).map(value => value.id) : [item.id]);
    if (current.document.items.some(value => ids.has(value.id) && current.document.tracks.find(candidate => candidate.id === value.trackId)?.locked)) {
      current.onError("A faixa selecionada está bloqueada"); return;
    }
    const asset = current.document.assets.find(value => value.id === item.assetId);
    if (!asset) return;
    const output = compositionOutputSize(current.document);
    const position = item.placement ?? DEFAULT_PLACEMENT;
    const layout = item.settings.splitScreen;
    const active = item.kind === "video" && current.document.settings.ratio === "9:16" && layout?.faceValidated ? splitLayoutAt(layout, current.time) : null;
    const geometry = compositionMediaGeometry(asset, item.settings, output, position, Boolean(active));
    if (!geometry) return;
    const hitX = (event.clientX - rect.left) / rect.width * output.width;
    const hitY = (event.clientY - rect.top) / rect.height * output.height;
    if (action === "move" && (hitX < geometry.bounds.left || hitX > geometry.bounds.left + geometry.bounds.width
      || hitY < geometry.bounds.top || hitY > geometry.bounds.top + geometry.bounds.height)) return;
    event.preventDefault(); event.stopPropagation(); current.onPause?.();
    const surface = event.currentTarget, pointerId = event.pointerId;
    let captured = false;
    if (surface.setPointerCapture && Number.isFinite(pointerId)) {
      try { surface.setPointerCapture(pointerId); captured = true; } catch { captured = false; }
    }
    const base = current.document, startX = event.clientX, startY = event.clientY;
    const point = item.settings.focalPoint ?? { x: 50, y: 50 };
    const layerTop = rect.top + rect.height * (position.y / 100 - position.scale / 2);
    const panel = startY - layerTop < rect.height * position.scale / 2 ? "top" : "bottom";
    let next = base, x = startX, y = startY, request = 0, ended = false;
    const clamp = (value: number) => Math.max(0, Math.min(100, value));
    const update = () => {
      request = 0; if (ended) return;
      const delta = { x: (x - startX) / rect.width * output.width, y: (y - startY) / rect.height * output.height };
      if (action !== "move" || !crop) {
        const placement = action === "move" ? { ...position, x: clamp(position.x + delta.x / output.width * 100), y: clamp(position.y + delta.y / output.height * 100) }
          : resizeCompositionPlacement(geometry, position, action, delta);
        const changed = placement.x !== position.x || placement.y !== position.y || placement.scale !== position.scale;
        next = changed ? { ...base, items: base.items.map(value => value.id === item.id ? { ...value, placement } : value) } : base;
      } else {
        const local = { x: delta.x / position.scale, y: delta.y / position.scale };
        if (layout && active) {
          const initial = active[panel];
          const split = splitPanelGeometry(asset.width, asset.height, initial);
          const moved = focalPointAfterDrag(initial, { width: split.outputWidth, height: split.outputHeight }, { width: split.scaledWidth, height: split.scaledHeight },
            { x: local.x / output.width * split.outputWidth, y: local.y / (output.height / 2) * split.outputHeight });
          const changed = moved.x !== initial.x || moved.y !== initial.y;
          const splitScreen = changed ? updateSplitPanel(layout, current.time, panel, moved) : layout;
          next = changed ? { ...base, items: base.items.map(value => ids.has(value.id) ? { ...value, settings: { ...value.settings, splitScreen } } : value) } : base;
        } else {
          const focalPoint = focalPointAfterDrag(point, output, geometry.content, local);
          const changed = focalPoint.x !== point.x || focalPoint.y !== point.y;
          next = changed ? { ...base, items: base.items.map(value => ids.has(value.id) ? { ...value, settings: { ...value.settings, focalPoint } } : value) } : base;
        }
      }
      latest.current.onPreview(next === base ? null : next);
    };
    const matching = (value: PointerEvent) => value.pointerId === undefined || value.pointerId === pointerId;
    const move = (value: PointerEvent) => { if (!matching(value)) return; x = value.clientX; y = value.clientY; if (!request) request = window.requestAnimationFrame(update); };
    const stop = () => {
      ended = true; window.cancelAnimationFrame(request);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel); window.removeEventListener("resize", cancel); window.removeEventListener("keydown", key); surface.removeEventListener("lostpointercapture", cancel);
      observer?.disconnect();
      cleanup.current = null;
      if (captured && surface.hasPointerCapture?.(pointerId)) surface.releasePointerCapture(pointerId);
    };
    const cancel = () => { stop(); latest.current.onPreview(null); };
    const up = (value: PointerEvent) => { if (!matching(value)) return; x = value.clientX; y = value.clientY; window.cancelAnimationFrame(request); update(); stop(); if (next !== base) latest.current.onChange(next); latest.current.onPreview(null); };
    const key = (value: KeyboardEvent) => { if (value.key === "Escape") { value.preventDefault(); value.stopImmediatePropagation(); cancel(); } };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const value = stage.getBoundingClientRect();
      if (value.width !== rect.width || value.height !== rect.height || value.left !== rect.left || value.top !== rect.top) cancel();
    });
    observer?.observe(stage); if (scope !== stage) observer?.observe(scope);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel); window.addEventListener("resize", cancel); window.addEventListener("keydown", key); surface.addEventListener("lostpointercapture", cancel);
    cleanup.current = cancel;
  };
}
