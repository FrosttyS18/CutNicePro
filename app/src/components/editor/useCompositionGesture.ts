import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { trimSelection } from "../../lib/composition-trim";
import { moveSelectionToTrack } from "../../lib/composition-arrange";
import { editId, linkedSelection } from "../../lib/composition-operations";
import { scrollTimelineAtPointer, selectionForClick, trimDeltaBounds } from "../../lib/composition-gesture";
import { compositionDropLane, containsDropPoint } from "../../lib/composition-drop-geometry";
import type { Composition, CompositionItem } from "../../lib/composition-types";

export interface CompositionTrackDropPreview {
  trackId: string; frame: number; durationFrames: number; y: number; newTrack: boolean;
}

interface Props {
  document: Composition; scale: number; frame: number; selected: string[];
  onSelect: (ids: string[]) => void; onChange: (document: Composition) => void;
  onPreview: (document: Composition | null, frame?: number) => void;
  onError: (message: string) => void;
  viewport?: RefObject<HTMLElement | null>;
  magnetic?: boolean;
  onTrackDropPreview?: (value: CompositionTrackDropPreview | null) => void;
}

function captureDropTracks(element: HTMLElement | null) {
  const lanes=[...element?.querySelectorAll<HTMLElement>("[data-composition-track]")??[]].map(candidate=>({
    trackId:candidate.dataset.compositionTrack,kind:candidate.dataset.trackKind,
    rect:candidate.getBoundingClientRect(),primary:candidate.dataset.primary==="true",
  }));
  const rect=element?.getBoundingClientRect();
  const contentTop=Math.max(rect?.top??0,element?.querySelector<HTMLElement>('.composition-ruler')?.getBoundingClientRect().bottom??(rect?.top??0)+40);
  return {lanes,rect,contentTop,newTrack:element?.querySelector<HTMLElement>("[data-drop-new-track]")?.getBoundingClientRect(),scrollTop:element?.scrollTop??0};
}

function dropTrack(geometry: ReturnType<typeof captureDropTracks>, x: number, y: number, item: CompositionItem, originTrackId: string, deltaY: number, scrollTop: number): string | null | undefined {
  const point={x,y},rect=geometry.rect;
  if(rect&&rect.width>0&&rect.height>0&&(!containsDropPoint(rect,point)||x<rect.left+144||y<geometry.contentTop))return undefined;
  if(Math.abs(deltaY)<12)return originTrackId;
  const offset=scrollTop-geometry.scrollTop;
  const shifted=(rect:DOMRect)=>({left:rect.left,right:rect.right,top:rect.top-offset,bottom:rect.bottom-offset});
  const lanes=geometry.lanes.map(lane=>({...lane,rect:lane.primary?lane.rect:shifted(lane.rect)}));
  const target=compositionDropLane(lanes,point);
  const zone = geometry.newTrack;
  if (!target?.primary&&zone&&containsDropPoint(shifted(zone),point)&&(item.kind==="video"||item.kind==="image")) return null;
  const kind = item.kind === "video" || item.kind === "image" ? "visual" : item.kind;
  if(!target)return kind==="visual"?null:undefined;
  return target.kind===kind ? target.trackId??item.trackId : undefined;
}

export function useCompositionGesture(options: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  const pendingFocus = useRef<{ viewport: HTMLElement; itemId: string } | null>(null);
  const latest = useRef(options);
  const anchor = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    latest.current = options;
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    if (!pending?.viewport.isConnected || globalThis.document.activeElement !== globalThis.document.body) return;
    const target = [...pending.viewport.querySelectorAll<HTMLElement>("[data-composition-item]")].find(item => item.dataset.compositionItem === pending.itemId);
    target?.focus({ preventScroll: true });
  }, [options]);
  useEffect(() => () => { cleanup.current?.(); pendingFocus.current = null; }, []);
  const begin = (event: PointerEvent<HTMLElement>, item: CompositionItem, edge?: "start" | "end") => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({preventScroll:true});
    const control = event.ctrlKey || event.metaKey;
    const ids = edge ? [item.id] : selectionForClick(options.document, options.selected, item, { control, shift: event.shiftKey }, anchor.current);
    options.onSelect(ids);
    if (!event.shiftKey && !control) anchor.current = item.id;
    const track = options.document.tracks.find(value => value.id === item.trackId)!;
    if (track.locked || control || event.shiftKey) return;
    cleanup.current?.();
    const base = options.document;
    const focusedTarget = event.currentTarget;
    const heldFocus = globalThis.document.activeElement === focusedTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const element = options.viewport?.current ?? null;
    const dropGeometry = captureDropTracks(element);
    const initialLane = compositionDropLane(dropGeometry.lanes,{x:startX,y:startY});
    const originTrackId = initialLane?.primary?initialLane.trackId??item.trackId:item.trackId;
    const startScroll = element?.scrollLeft ?? 0;
    const scale = options.scale;
    let latestX = startX;
    let latestY = startY;
    let next = base;
    let raf: number | null = null;
    let message = "";
    let dragged = false;
    const origin = Math.min(...linkedSelection(base, ids).map(value => value.startFrame));
    const movingIds = [item.id, ...ids.filter(id => id !== item.id)];
    const newTrackId = editId();
    const companionTrackIds = Object.fromEntries(base.tracks.map(value=>[value.id,editId()]));
    const magnetic = options.magnetic !== false;
    const publishPreview = (value: Composition | null) => latest.current.onPreview(value);
    const publishTrackDrop = (value: CompositionTrackDropPreview | null) => latest.current.onTrackDropPreview?.(value);
    const restoreFocus = () => {
      if (heldFocus && !focusedTarget.isConnected && element && globalThis.document.activeElement === globalThis.document.body) pendingFocus.current = { viewport: element, itemId: item.id };
    };
    publishPreview(base);
    if (!edge && element) element.setAttribute("data-dragging", "true");
    const compute = () => {
      let delta = Math.round((latestX - startX + (element?.scrollLeft ?? 0) - startScroll) / scale);
      try {
        if (edge) {
          const [min, max] = trimDeltaBounds(base, item, edge, { magnetic });
          delta = Math.max(min, Math.min(max, delta));
          next = trimSelection(base, item.id, edge, delta, { magnetic });
        } else {
          if (Math.hypot(latestX - startX, latestY - startY) < 3 && !delta) {next=base;message="";publishTrackDrop(null);publishPreview(base);return;}
          dragged = true;
          const scrollTop=element?.scrollTop??0;
          const destination=dropTrack(dropGeometry, latestX, latestY, item, originTrackId, latestY-startY, scrollTop);
          if(destination===undefined){next=base;message="";publishTrackDrop(null);publishPreview(base);return;}
          next = moveSelectionToTrack(base, movingIds, Math.max(0, origin + delta), destination, { magnetic, newTrackId, companionTrackIds });
          const placed=next.items.find(value=>value.id===item.id)!;
          if(placed.trackId!==item.trackId){
            const lane=dropGeometry.lanes.find(value=>value.trackId===placed.trackId);
            const offset=scrollTop-dropGeometry.scrollTop;
            const firstVisual=dropGeometry.lanes.filter(value=>value.kind==="visual").reduce((top,value)=>Math.min(top,value.rect.top-(value.primary?0:offset)),Number.POSITIVE_INFINITY);
            const y=lane?(lane.rect.top+lane.rect.bottom)/2-(lane.primary?0:offset):Number.isFinite(firstVisual)?firstVisual-2:latestY;
            const safeY=Math.max(dropGeometry.contentTop+6,Math.min(y,(dropGeometry.rect?.bottom??y+8)-8));
            publishTrackDrop({trackId:placed.trackId,frame:placed.startFrame,durationFrames:placed.durationFrames,y:safeY,newTrack:!lane});
            publishPreview(base);message="";return;
          }
        }
        publishTrackDrop(null);
        publishPreview(next);
        message = "";
      } catch (error) {
        const text = error instanceof Error ? error.message : "Não foi possível ajustar o trecho";
        next = base;
        publishTrackDrop(null);
        publishPreview(base);
        message = text;
      }
    };
    const tick = () => {
      raf = null;
      const scrolled = scrollTimelineAtPointer(element, latestX);
      compute();
      if (scrolled&&raf===null) raf = window.requestAnimationFrame(tick);
    };
    const move = (moveEvent: globalThis.PointerEvent) => {
      latestX = moveEvent.clientX;
      latestY = moveEvent.clientY;
      if (raf === null) raf = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("keydown", key, true);
      element?.removeEventListener("scroll", scroll);
      cleanup.current = null;
      element?.removeAttribute("data-dragging");
      publishTrackDrop(null);
    };
    const cancel = () => { stop(); restoreFocus(); publishPreview(null); };
    const up = (upEvent: globalThis.PointerEvent) => {
      latestX = upEvent.clientX;
      latestY = upEvent.clientY;
      compute(); stop();
      if(next!==base&&heldFocus&&element&&globalThis.document.activeElement===focusedTarget)pendingFocus.current={viewport:element,itemId:item.id};
      restoreFocus();
      if (!edge&&!dragged) latest.current.onSelect([item.id]);
      if (next !== base) latest.current.onChange(next);
      publishPreview(null);
      if (message) latest.current.onError(message);
    };
    const scroll = () => { if(raf===null)raf=window.requestAnimationFrame(tick); };
    const key = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.code === "Space" || keyEvent.key === " " || keyEvent.key === "Spacebar") {
        if (keyEvent.defaultPrevented || keyEvent.isComposing || keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey || keyEvent.shiftKey) return;
        const target = keyEvent.target instanceof HTMLElement ? keyEvent.target : globalThis.document.activeElement;
        const scope = element?.closest("[data-editor-timeline]") ?? element;
        const lostFocus = heldFocus && !focusedTarget.isConnected && target === globalThis.document.body;
        if (!target || !lostFocus && !scope?.contains(target)) return;
        if (target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],dialog,[role="menu"],[data-editor-viewer="source"]')
          || globalThis.document.querySelector('dialog[open]:not([data-modeless]),[aria-modal="true"]')) return;
        keyEvent.preventDefault(); keyEvent.stopImmediatePropagation(); return;
      }
      if (keyEvent.key === "Escape") { keyEvent.preventDefault(); keyEvent.stopImmediatePropagation(); cancel(); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    window.addEventListener("keydown", key, true);
    element?.addEventListener("scroll", scroll);
    cleanup.current = stop;
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>, item: CompositionItem, edge: "start" | "end") => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    try {
      const magnetic = options.magnetic !== false;
      const [min, max] = trimDeltaBounds(options.document, item, edge, { magnetic });
      const delta = event.key === "Home" ? min : event.key === "End" ? max : (event.shiftKey ? 10 : 1) * (event.key === "ArrowLeft" ? -1 : 1);
      const next = trimSelection(options.document, item.id, edge, Math.max(min, Math.min(max, delta)), { magnetic });
      if (next !== options.document) options.onChange(next);
    }
    catch (error) { options.onError(error instanceof Error ? error.message : "Não foi possível ajustar o trecho"); }
  };
  return { begin, keyboard };
}
