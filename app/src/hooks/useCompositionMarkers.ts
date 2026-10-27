import { useCallback,useState,type RefObject } from "react";
import { addCompositionMarker,removeCompositionMarker,updateCompositionMarker } from "../lib/composition-markers";
import type { Composition,CompositionMarker } from "../lib/composition-types";

interface Point {x:number;y:number}
interface Props {document:Composition|null;frame:number;enabled:boolean;scope:RefObject<HTMLElement|null>;onChange:(next:Composition)=>void;onPause:()=>void;onError:(message:string)=>void}
export function useCompositionMarkers({document,frame,enabled,scope,onChange,onPause,onError}:Props){
  const [target,setTarget]=useState<({id:string}&Point)|null>(null);
  const close=useCallback(()=>setTarget(null),[]);
  const edit=(id:string,point?:Point)=>{
    if(!enabled||!document?.markers?.some(marker=>marker.id===id))return;
    onPause();
    const element=[...scope.current?.querySelectorAll<HTMLElement>('[data-composition-marker]')??[]].find(value=>value.dataset.compositionMarker===id);
    const bounds=element?.getBoundingClientRect()??scope.current?.getBoundingClientRect();
    setTarget({id,x:point?.x??bounds?.left??16,y:point?.y??(bounds?bounds.top-220:16)});
  };
  const mark=()=>{
    if(!enabled||!document)return;
    const existing=document.markers?.find(marker=>marker.frame===frame);
    if(existing){edit(existing.id);return;}
    try{onChange(addCompositionMarker(document,frame));}
    catch(error){onError(error instanceof Error?error.message:"Não foi possível adicionar o marcador.");}
  };
  const apply=(patch:Partial<Pick<CompositionMarker,"name"|"frame"|"color">>)=>{
    if(!enabled||!document||!target)return;
    onChange(updateCompositionMarker(document,target.id,patch));close();
  };
  const remove=()=>{
    if(!enabled||!document||!target)return;
    onChange(removeCompositionMarker(document,target.id));close();
  };
  const marker=document?.markers?.find(value=>value.id===target?.id);
  return {mark,edit,apply,remove,close,marker,point:target};
}
