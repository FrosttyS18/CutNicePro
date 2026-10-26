import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { linkedSelection } from "../../lib/composition-operations";
import { splitLayoutAt, updateSplitPanel } from "../../lib/split-screen";
import { DEFAULT_PLACEMENT } from "../../lib/composition-placement";
import type { Composition, CompositionItem } from "../../lib/composition-types";

interface Props {document:Composition;item:CompositionItem|undefined;time:number;enabled:boolean;mode?:"crop"|"placement";onPreview:(next:Composition|null)=>void;onChange:(next:Composition)=>void;onError:(message:string)=>void}
export function useCompositionFraming(props:Props){
  const cleanup=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>cleanup.current?.(),[]);
  return (event:ReactPointerEvent<HTMLDivElement>)=>{
    if(!props.enabled||!props.item||event.button!==0||!(props.item.kind==="video"||props.item.kind==="image"))return;
    const target=event.currentTarget.querySelector<HTMLElement>(".composition-stage");
    if(!target?.contains(event.target as Node))return;
    const item=props.item;
    const placement=props.mode==="placement";
    if(placement && ((event.target as Element).closest<HTMLElement>("[data-composition-layer]")?.dataset.compositionLayer!==item.id
      || props.document.tracks.find(track=>track.id===item.trackId)?.primary))return;
    const stageRect=target.getBoundingClientRect();
    const position=item.placement??DEFAULT_PLACEMENT;
    const rect=placement?stageRect:{width:stageRect.width*position.scale,height:stageRect.height*position.scale,
      left:stageRect.left+stageRect.width*(position.x/100-position.scale/2),top:stageRect.top+stageRect.height*(position.y/100-position.scale/2)};
    if(!rect.width||!rect.height)return;
    const ids=new Set(placement?[item.id]:linkedSelection(props.document,[item.id]).map(value=>value.id));
    if(props.document.items.some(value=>ids.has(value.id)&&props.document.tracks.find(track=>track.id===value.trackId)?.locked)){props.onError("A faixa selecionada está bloqueada");return;}
    event.preventDefault();event.stopPropagation();cleanup.current?.();
    const base=props.document;const startX=event.clientX;const startY=event.clientY;
    const point=item.settings.focalPoint??{x:50,y:50};
    const layout=item.settings.splitScreen;
    const active=layout?.faceValidated?splitLayoutAt(layout,props.time):null;
    const panel=event.clientY-rect.top<rect.height/2?"top":"bottom";
    let next=base;let x=startX;let y=startY;let request=0;
    const clamp=(value:number)=>Math.max(0,Math.min(100,value));
    const update=()=>{
      request=0;const dx=(x-startX)/rect.width*100;const dy=(y-startY)/rect.height*100;
      if(placement){
        next={...base,items:base.items.map(value=>value.id===item.id?{...value,placement:{...position,x:clamp(position.x+dx),y:clamp(position.y+dy)}}:value)};
      }else{
        const patch=layout&&active?{splitScreen:updateSplitPanel(layout,props.time,panel,{x:clamp(active[panel].x-dx),y:clamp(active[panel].y-dy*2)})}:{focalPoint:{x:clamp(point.x-dx),y:clamp(point.y-dy)}};
        next={...base,items:base.items.map(value=>ids.has(value.id)?{...value,settings:{...value.settings,...patch}}:value)};
      }
      props.onPreview(next);
    };
    const move=(value:PointerEvent)=>{x=value.clientX;y=value.clientY;if(!request)request=window.requestAnimationFrame(update);};
    const stop=()=>{window.cancelAnimationFrame(request);window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancel);window.removeEventListener("blur",cancel);window.removeEventListener("keydown",key);cleanup.current=null;};
    const cancel=()=>{stop();props.onPreview(null);};
    const up=(value:PointerEvent)=>{x=value.clientX;y=value.clientY;window.cancelAnimationFrame(request);update();stop();if(x!==startX||y!==startY)props.onChange(next);props.onPreview(null);};
    const key=(value:KeyboardEvent)=>{if(value.key==="Escape"){value.preventDefault();value.stopImmediatePropagation();cancel();}};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);window.addEventListener("blur",cancel);window.addEventListener("keydown",key);cleanup.current=stop;
  };
}
