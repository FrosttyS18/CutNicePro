import { useEffect, useRef } from "react";
import { clipTrashExpiresAt } from "../lib/clip-trash";
import type { LibraryClip } from "../lib/clip-library";

export function useClipTrashExpiry(entries:LibraryClip[],reload?:()=>void,enabled=true){
  const callback=useRef(reload);
  const lastRefresh=useRef(-Infinity);
  useEffect(()=>{callback.current=reload;},[reload]);
  const expires=entries.reduce((next,entry)=>Math.min(next,clipTrashExpiresAt(entry.clip)??Infinity),Infinity);
  useEffect(()=>{
    if(!enabled||!Number.isFinite(expires)||!callback.current)return;
    const refresh=()=>{
      const now=Date.now();
      if(now<expires||now-lastRefresh.current<60000)return;
      lastRefresh.current=now;callback.current?.();
    };
    const wait=Math.max(expires-Date.now(),lastRefresh.current+60000-Date.now());
    const tick=()=>{refresh();timer=setTimeout(tick,60000);};
    let timer=setTimeout(tick,Math.min(Math.max(1,wait),2147483647));
    window.addEventListener("focus",refresh);
    return()=>{clearTimeout(timer);window.removeEventListener("focus",refresh);};
  },[expires,enabled]);
}
