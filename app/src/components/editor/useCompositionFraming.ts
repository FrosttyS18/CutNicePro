import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { linkedSelection } from "../../lib/composition-operations";
import { splitLayoutAt, splitPanelGeometry, updateSplitPanel } from "../../lib/split-screen";
import { compositionOutputSize, DEFAULT_PLACEMENT } from "../../lib/composition-placement";
import { compositionMediaGeometry, focalPointAfterDrag, resizeCompositionPlacement, type CompositionFramingAction } from "../../lib/composition-media-geometry";
import { activeItems, sourceTimeAt } from "../../lib/composition-playback";
import type { Composition, CompositionItem } from "../../lib/composition-types";
import { snapCompositionPlacement, type CompositionSnapGuides } from "../../lib/composition-preview-snap";

export type { CompositionFramingAction } from "../../lib/composition-media-geometry";

interface Props {
  document: Composition; item: CompositionItem | undefined; time: number; enabled: boolean; mode?: "crop" | "placement";
  frame?: number; playing?: boolean; selectionKey?: string; viewportRevision?: number; onPause?: () => void; stageRef?: RefObject<HTMLElement | null>;
  onPreview: (next: Composition | null) => void; onChange: (next: Composition) => void; onError: (message: string) => void;
  onSnapGuides?: (guides: CompositionSnapGuides) => void;
  onSelect?: (id: string) => void;
}

export function useCompositionFraming(props: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  const gestureSelection = useRef<{ id: string; key?: string } | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const sourceTime = props.frame === undefined ? props.time : undefined;
  useEffect(() => { cleanup.current?.(); }, [props.frame, sourceTime, props.enabled, props.mode, props.viewportRevision, props.document.revision]);
  useEffect(() => {
    const selected = gestureSelection.current;
    if (!selected) return;
    const track = props.document.tracks.find(value => value.id === props.item?.trackId);
    if (props.item?.id !== selected.id || props.selectionKey !== selected.key || track?.locked || track?.hidden) cleanup.current?.();
  }, [props.item?.id, props.item?.trackId, props.selectionKey, props.document.tracks]);
  useEffect(() => { if (props.playing) cleanup.current?.(); }, [props.playing]);
  useEffect(() => () => cleanup.current?.(), []);

  return (event: ReactPointerEvent<HTMLElement>, action: CompositionFramingAction = "move") => {
    const current = latest.current;
    if (!current.enabled || event.button !== 0 || cleanup.current) return;
    const origin = event.target as Element;
    if (origin.closest?.("button,input,textarea,select,[contenteditable=true],[role=button]")) return;
    const hit = origin.closest?.("[data-composition-selection],[data-composition-layer]");
    if (!hit) return;
    const scope = current.stageRef?.current ?? event.currentTarget;
    const stage = scope.matches(".composition-stage") ? scope : scope.querySelector<HTMLElement>(".composition-stage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const output = compositionOutputSize(current.document);
    const hitX = (event.clientX - rect.left) / rect.width * output.width;
    const hitY = (event.clientY - rect.top) / rect.height * output.height;
    const selecting = action === "move" && current.mode === "placement" && Boolean(current.onSelect);
    const rendered = new Set([...stage.querySelectorAll("[data-composition-layer]")].map(value => value.getAttribute("data-composition-layer")));
    const item = selecting ? activeItems(current.document, current.frame ?? 0).reverse().find(value => {
      if (!(value.kind === "video" || value.kind === "image") || !rendered.has(value.id) || value.placement?.opacity === 0) return false;
      const asset = current.document.assets.find(asset => asset.id === value.assetId);
      if (!asset) return false;
      const layout = value.settings.splitScreen;
      const split = value.kind === "video" && current.document.settings.ratio === "9:16" && layout?.faceValidated
        && Boolean(splitLayoutAt(layout, sourceTimeAt(value, current.frame ?? 0, current.document.fps)));
      const bounds = compositionMediaGeometry(asset, value.settings, output, value.placement, Boolean(split))?.bounds;
      return bounds && hitX >= bounds.left && hitX <= bounds.left + bounds.width && hitY >= bounds.top && hitY <= bounds.top + bounds.height;
    }) : current.item;
    if (!item || !(item.kind === "video" || item.kind === "image")) return false;
    if (!selecting && (hit.getAttribute("data-composition-selection") ?? hit.getAttribute("data-composition-layer")) !== item.id) return;
    const selectedTrack = current.document.tracks.find(value => value.id === item.trackId);
    if (!selectedTrack || selectedTrack.hidden || current.frame !== undefined && (current.frame < item.startFrame || current.frame >= item.startFrame + item.durationFrames)) return;
    if (selecting) current.onSelect?.(item.id);
    const crop = action === "move" && current.mode !== "placement";
    const ids = new Set(crop ? linkedSelection(current.document, [item.id]).map(value => value.id) : [item.id]);
    if (current.document.items.some(value => ids.has(value.id) && current.document.tracks.find(candidate => candidate.id === value.trackId)?.locked)) {
      current.onError("A faixa selecionada está bloqueada"); return selecting;
    }
    const asset = current.document.assets.find(value => value.id === item.assetId);
    if (!asset) return;
    const position = item.placement ?? DEFAULT_PLACEMENT;
    const layout = item.settings.splitScreen;
    const time = current.frame === undefined ? current.time : sourceTimeAt(item, current.frame, current.document.fps);
    const active = item.kind === "video" && current.document.settings.ratio === "9:16" && layout?.faceValidated ? splitLayoutAt(layout, time) : null;
    const geometry = compositionMediaGeometry(asset, item.settings, output, position, Boolean(active));
    if (!geometry) return;
    if (action === "move" && (hitX < geometry.bounds.left || hitX > geometry.bounds.left + geometry.bounds.width
      || hitY < geometry.bounds.top || hitY > geometry.bounds.top + geometry.bounds.height)) return;
    event.preventDefault(); event.stopPropagation(); current.onPause?.();
    gestureSelection.current = { id: item.id, key: selecting ? item.id : current.selectionKey };
    const surface = event.currentTarget, pointerId = event.pointerId;
    let captured = false;
    if (surface.setPointerCapture && Number.isFinite(pointerId)) {
      try { surface.setPointerCapture(pointerId); captured = true; } catch { captured = false; }
    }
    const base = current.document, startX = event.clientX, startY = event.clientY;
    const point = item.settings.focalPoint ?? { x: 50, y: 50 };
    const layerTop = rect.top + rect.height * (position.y / 100 - position.scale / 2);
    const panel = startY - layerTop < rect.height * position.scale / 2 ? "top" : "bottom";
    let next = base, x = startX, y = startY, request = 0, ended = false, bypass = Boolean(event.altKey), constrained = Boolean(event.shiftKey);
    let axis: "x" | "y" | null = null;
    const clamp = (value: number) => Math.max(0, Math.min(100, value));
    const update = () => {
      request = 0; if (ended) return;
      if (action === "move" && constrained && !axis && (x !== startX || y !== startY)) axis = Math.abs(x - startX) >= Math.abs(y - startY) ? "x" : "y";
      const delta = { x: (x - startX) / rect.width * output.width, y: (y - startY) / rect.height * output.height };
      if (action === "move" && constrained) { if (axis === "x") delta.y = 0; else if (axis === "y") delta.x = 0; }
      if (action !== "move" || !crop) {
        const candidate = action === "move" ? { ...position, x: clamp(position.x + delta.x / output.width * 100), y: clamp(position.y + delta.y / output.height * 100) }
          : resizeCompositionPlacement(geometry, position, action, delta);
        const snapped = action === "move" && !bypass && (x !== startX || y !== startY)
          ? snapCompositionPlacement(geometry, position, candidate, rect) : { placement: candidate, guides: {} };
        const placement = snapped.placement;
        if (action === "move" && constrained) {
          if (axis === "x") { placement.y = position.y; delete snapped.guides.y; }
          else if (axis === "y") { placement.x = position.x; delete snapped.guides.x; }
        }
        latest.current.onSnapGuides?.(snapped.guides);
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
          const splitScreen = changed ? updateSplitPanel(layout, time, panel, moved) : layout;
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
    const modifiers = (value: PointerEvent) => { bypass = Boolean(value.altKey); if (constrained !== Boolean(value.shiftKey)) { constrained = Boolean(value.shiftKey); axis = null; } };
    const move = (value: PointerEvent) => { if (!matching(value)) return; x = value.clientX; y = value.clientY; modifiers(value); if (!request) request = window.requestAnimationFrame(update); };
    const stop = () => {
      ended = true; window.cancelAnimationFrame(request);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel); window.removeEventListener("resize", cancel); window.removeEventListener("keydown", key); window.removeEventListener("keyup", keyUp); surface.removeEventListener("lostpointercapture", cancel);
      observer?.disconnect();
      cleanup.current = null;
      gestureSelection.current = null;
      latest.current.onSnapGuides?.({});
      if (captured && surface.hasPointerCapture?.(pointerId)) surface.releasePointerCapture(pointerId);
    };
    const cancel = () => { stop(); latest.current.onPreview(null); };
    const up = (value: PointerEvent) => { if (!matching(value)) return; x = value.clientX; y = value.clientY; modifiers(value); window.cancelAnimationFrame(request); update(); stop(); if (next !== base) latest.current.onChange(next); latest.current.onPreview(null); };
    const key = (value: KeyboardEvent) => {
      if (value.key === "Escape") { value.preventDefault(); value.stopImmediatePropagation(); cancel(); }
      else if (value.key === "Alt") { bypass = true; window.cancelAnimationFrame(request); update(); }
      else if (value.key === "Shift") { constrained = true; window.cancelAnimationFrame(request); update(); }
    };
    const keyUp = (value: KeyboardEvent) => {
      if (value.key === "Alt") { bypass = false; window.cancelAnimationFrame(request); update(); }
      else if (value.key === "Shift") { constrained = false; axis = null; window.cancelAnimationFrame(request); update(); }
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const value = stage.getBoundingClientRect();
      if (value.width !== rect.width || value.height !== rect.height || value.left !== rect.left || value.top !== rect.top) cancel();
    });
    observer?.observe(stage); if (scope !== stage) observer?.observe(scope);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel); window.addEventListener("resize", cancel); window.addEventListener("keydown", key); window.addEventListener("keyup", keyUp); surface.addEventListener("lostpointercapture", cancel);
    cleanup.current = cancel;
    return true;
  };
}
