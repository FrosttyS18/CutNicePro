import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CompositionClock } from "../lib/composition-clock";
import type { FrameRate } from "../lib/composition-types";

export function useCompositionPlayback(fps:FrameRate,duration:number,ready=true,options:{preservePausedPosition?:boolean}={}) {
  const {preservePausedPosition=false}=options;
  const clock=useMemo(()=>new CompositionClock({numerator:fps.numerator,denominator:fps.denominator}),[fps.numerator,fps.denominator]);
  const [position,setPosition]=useState(0);
  const [playing,setPlaying]=useState(false);
  const frame=preservePausedPosition&&!playing?position:Math.min(position,duration);
  const current=useRef(frame);
  useLayoutEffect(()=>{current.current=frame;},[frame]);
  const pause=useCallback(()=>{
    const now=performance.now();
    if(preservePausedPosition){
      const value=current.current;
      clock.seek(value,now);clock.pause(now,Math.max(duration,value));setPosition(value);
    }else{clock.pause(now,duration);setPosition(clock.read(now,duration));}
    setPlaying(false);
  },[clock,duration,preservePausedPosition]);
  const seek=useCallback((next:number)=>{
    const value=Math.max(0,Math.min(duration,Math.round(next)));
    clock.seek(value,performance.now());current.current=value;setPosition(value);
  },[clock,duration]);
  const toggle=useCallback(()=>{
    if(playing){pause();return;}
    if(!duration)return;
    const start=current.current>=duration ? 0 : current.current;
    const now=performance.now();
    if(ready)clock.play(start,now);else{clock.seek(start,now);clock.pause(now,duration);}
    setPosition(start);setPlaying(true);
  },[clock,duration,playing,pause,ready]);
  useLayoutEffect(()=>{
    const now=performance.now();
    if(!playing||!ready){clock.seek(current.current,now);clock.pause(now,Math.max(duration,current.current));return;}
    clock.play(current.current,now);
    let request=0;
    const tick=(now:number)=>{
      const next=clock.read(now,duration);current.current=next;setPosition(next);
      if(next>=duration){clock.pause(now,duration);setPlaying(false);return;}
      request=window.requestAnimationFrame(tick);
    };
    request=window.requestAnimationFrame(tick);
    return()=>window.cancelAnimationFrame(request);
  },[clock,duration,playing,ready]);
  return {frame,playing,buffering:playing&&!ready,seek,pause,toggle};
}
