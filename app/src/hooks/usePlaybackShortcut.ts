import { useEffect, useLayoutEffect, useRef } from "react";
import { shouldTogglePlayback } from "../lib/playback";

export function usePlaybackShortcut(enabled:boolean,toggle:()=>void) {
  const latest=useRef(toggle);
  useLayoutEffect(()=>{latest.current=toggle;},[toggle]);
  useEffect(()=>{
    if(!enabled) return;
    function handle(event:KeyboardEvent) {
      const element=event.target instanceof Element?event.target:null;
      const interactive=Boolean(element?.closest('input,textarea,select,button,a,summary,video[controls],[contenteditable="true"],[role="menu"],[role="tab"]'));
      if(event.defaultPrevented || !shouldTogglePlayback({key:event.key,repeat:event.repeat,modified:event.ctrlKey||event.metaKey||event.altKey,
        interactive,dialogOpen:Boolean(document.querySelector('dialog[open]:not([data-modeless]),[aria-modal="true"]'))})) return;
      event.preventDefault(); latest.current();
    }
    window.addEventListener("keydown",handle);
    return ()=>window.removeEventListener("keydown",handle);
  },[enabled]);
}
