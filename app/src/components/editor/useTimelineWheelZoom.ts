import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export interface TimelineZoomPointer { x: number; y: number }
export function useTimelineWheelZoom(target: RefObject<HTMLElement | null>, onZoom: (direction: number, pointer: TimelineZoomPointer) => void) {
  const latest=useRef(onZoom);
  useLayoutEffect(()=>{latest.current=onZoom;},[onZoom]);
  useEffect(()=>{
    const element=target.current;
    if(!element)return;
    const wheel=(event:WheelEvent)=>{
      if(event.defaultPrevented||!event.ctrlKey||event.deltaY===0)return;
      event.preventDefault();
      const unit=event.deltaMode===1?16:event.deltaMode===2?element.clientHeight||200:1;
      latest.current(Math.max(-1,Math.min(1,-event.deltaY*unit/100)),{x:event.clientX,y:event.clientY});
    };
    element.addEventListener("wheel",wheel,{passive:false});
    return()=>element.removeEventListener("wheel",wheel);
  },[target]);
}
