import { useCallback,useEffect,useLayoutEffect,useRef,useState,type PointerEvent,type RefObject } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { compositionMediaKind,type CompositionImportIntent } from "../lib/composition-import-intent";
import { containsDropPoint,physicalDropPoint,type CompositionDropPoint } from "../lib/composition-drop-geometry";
import type { CompositionTimelineDropController } from "../lib/composition-drop-controller";
import type { CompositionDropTarget } from "../lib/composition-asset-drop";
import type { CompositionAsset,MediaKind } from "../lib/composition-types";

interface Options{
  scope:RefObject<HTMLElement|null>;
  timeline:RefObject<CompositionTimelineDropController|null>;
  sessionKey:string;enabled:boolean;
  onAsset:(asset:CompositionAsset,target:CompositionDropTarget)=>void;
  onPath:(path:string,intent:CompositionImportIntent)=>void;
  onPause:()=>void;onError:(message:string)=>void;
}
export function useCompositionMediaDrop(options:Options){
  const latest=useRef(options);
  const cancelPointer=useRef<(()=>void)|null>(null);
  const [libraryDropActive,setLibraryDropActive]=useState(false);
  useLayoutEffect(()=>{latest.current=options;},[options]);
  const available=useCallback(()=>latest.current.enabled&&Boolean(latest.current.scope.current?.isConnected)
    &&!globalThis.document.querySelector('dialog[open]:not([data-modeless]),[aria-modal="true"]'),[]);
  const libraryAt=useCallback((point:CompositionDropPoint)=>{
    const section=latest.current.scope.current?.querySelector<HTMLElement>('[data-composition-library]');
    return Boolean(section&&!section.closest('[hidden]')&&containsDropPoint(section.getBoundingClientRect(),point));
  },[]);
  const clear=useCallback(()=>{latest.current.timeline.current?.clear();setLibraryDropActive(false);},[]);
  const hover=useCallback((point:CompositionDropPoint,kind:MediaKind,internal:boolean)=>{
    if(!available()){clear();return;}
    const library=!internal&&libraryAt(point);
    setLibraryDropActive(library);
    if(library)latest.current.timeline.current?.clear();else latest.current.timeline.current?.hover(point,kind);
  },[available,clear,libraryAt]);
  const destination=useCallback((point:CompositionDropPoint,kind:MediaKind,internal:boolean):CompositionImportIntent|null=>{
    if(!available())return null;
    if(!internal&&libraryAt(point))return {kind:"library"};
    const target=latest.current.timeline.current?.resolve(point,kind);
    return target?{kind:"drop",target}:null;
  },[available,libraryAt]);
  const beginAssetDrag=useCallback((event:PointerEvent<HTMLElement>,asset:CompositionAsset)=>{
    if(event.button!==0||event.isPrimary===false||!available())return;
    event.preventDefault();event.currentTarget.focus({preventScroll:true});cancelPointer.current?.();
    const element=event.currentTarget,start={x:event.clientX,y:event.clientY};
    delete element.dataset.assetDragged;
    let point=start,dragged=false,raf=0;
    const tick=()=>{raf=0;if(!dragged)return;hover(point,asset.kind,true);raf=window.requestAnimationFrame(tick);};
    const move=(next:globalThis.PointerEvent)=>{
      point={x:next.clientX,y:next.clientY};
      if(!dragged&&Math.hypot(point.x-start.x,point.y-start.y)>=4){dragged=true;element.dataset.assetDragged="true";latest.current.onPause();}
      if(dragged&&!raf)raf=window.requestAnimationFrame(tick);
    };
    const stop=()=>{
      window.cancelAnimationFrame(raf);window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);
      window.removeEventListener("pointercancel",cancel);window.removeEventListener("blur",cancel);window.removeEventListener("keydown",key,true);
      cancelPointer.current=null;clear();
    };
    const cancel=()=>stop();
    const up=(next:globalThis.PointerEvent)=>{
      const target=dragged?destination({x:next.clientX,y:next.clientY},asset.kind,true):null;
      stop();if(target?.kind==="drop")latest.current.onAsset(asset,target.target);
      else if(dragged&&latest.current.timeline.current?.contains({x:next.clientX,y:next.clientY}))latest.current.onError("Solte em uma faixa compatível e desbloqueada ou em uma nova camada.");
    };
    const key=(next:KeyboardEvent)=>{
      if(next.key==="Escape"){next.preventDefault();next.stopImmediatePropagation();cancel();}
      else if(dragged){next.preventDefault();next.stopImmediatePropagation();}
    };
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);
    window.addEventListener("blur",cancel);window.addEventListener("keydown",key,true);cancelPointer.current=stop;
  },[available,hover,destination,clear]);
  useEffect(()=>{
    if(!options.enabled)cancelPointer.current?.();
  },[options.enabled]);
  useEffect(()=>()=>cancelPointer.current?.(),[options.sessionKey]);
  useEffect(()=>{
    if(!("__TAURI_INTERNALS__" in window))return;
    let disposed=false,off:(()=>void)|undefined,raf=0;
    let active:{paths:string[];point:CompositionDropPoint;kind:MediaKind}|null=null;
    const stop=()=>{window.cancelAnimationFrame(raf);raf=0;active=null;clear();};
    const tick=()=>{raf=0;if(disposed||!active)return;if(!available()){stop();return;}hover(active.point,active.kind,false);raf=window.requestAnimationFrame(tick);};
    void getCurrentWebview().onDragDropEvent(event=>{
      if(disposed)return;
      const payload=event.payload;
      if(payload.type==="leave"){stop();return;}
      const point=physicalDropPoint(payload.position,window.devicePixelRatio);
      if(!point){stop();return;}
      if(payload.type==="drop"){
        stop();if(!available())return;
        const relevant=libraryAt(point)||latest.current.timeline.current?.contains(point);
        if(!relevant)return;
        if(payload.paths.length!==1){latest.current.onError("Importe um arquivo por vez.");return;}
        const path=payload.paths[0],kind=compositionMediaKind(path);
        if(!kind){latest.current.onError("Formato não suportado. Escolha um vídeo, imagem ou áudio compatível.");return;}
        const intent=destination(point,kind,false);
        if(intent){latest.current.onPause();latest.current.onPath(path,intent);}
        else latest.current.onError("Solte em uma faixa compatível e desbloqueada ou em uma nova camada.");
        return;
      }
      if(payload.type==="enter"){
        const kind=payload.paths.length===1?compositionMediaKind(payload.paths[0]):null;
        active=kind?{paths:payload.paths,point,kind}:null;
      }else if(active)active.point=point;
      if(active){hover(point,active.kind,false);if(!raf)raf=window.requestAnimationFrame(tick);}else clear();
    }).then(unlisten=>{if(disposed)unlisten();else off=unlisten;}).catch(()=>{
      if(!disposed)latest.current.onError("Arrastar arquivos indisponível. Use Importar mídia.");
    });
    const escape=(event:KeyboardEvent)=>{
      if(!active)return;
      if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();stop();}
      else if(available()){event.preventDefault();event.stopImmediatePropagation();}
    };
    window.addEventListener("keydown",escape,true);
    return()=>{disposed=true;off?.();stop();window.removeEventListener("keydown",escape,true);};
  },[options.sessionKey,available,clear,destination,hover,libraryAt]);
  return {beginAssetDrag,libraryDropActive};
}
