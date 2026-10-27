import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./editor-popover.css";

interface Props { label:string; x:number; y:number; onClose:()=>void; children:ReactNode; width?:number }
export function EditorPopover({label,x,y,onClose,children,width=320}:Props){
  const ref=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({left:x,top:y});
  const latest=useRef(onClose);
  useLayoutEffect(()=>{latest.current=onClose;},[onClose]);
  useEffect(()=>{
    const previous=document.activeElement;
    const fallback=previous instanceof HTMLElement?previous.parentElement?.closest<HTMLElement>('[tabindex]'):null;
    const element=ref.current;
    element?.querySelector<HTMLElement>('input,button:not(:disabled),[tabindex="0"]')?.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{if(!element?.contains(event.target as Node))latest.current();};
    window.addEventListener("pointerdown",outside);
    return()=>{window.removeEventListener("pointerdown",outside);const restore=previous instanceof HTMLElement&&previous.isConnected?previous:fallback?.isConnected?fallback:null;restore?.focus({preventScroll:true});};
  },[]);
  const actualWidth=Math.min(width,Math.max(0,window.innerWidth-16));
  useLayoutEffect(()=>{
    const element=ref.current;
    if(!element)return;
    const place=()=>{
      const bounds=element.getBoundingClientRect();
      const left=Math.max(8,Math.min(x,window.innerWidth-bounds.width-8));
      const top=Math.max(8,Math.min(y,window.innerHeight-bounds.height-8));
      setPosition(current=>current.left===left&&current.top===top?current:{left,top});
    };
    place();
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(place):null;
    observer?.observe(element);window.addEventListener("resize",place);
    return()=>{observer?.disconnect();window.removeEventListener("resize",place);};
  },[x,y,actualWidth]);
  return createPortal(<div ref={ref} className="editor-popover" role="dialog" aria-label={label}
    style={{width:actualWidth,...position}}
    onKeyDown={event=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();latest.current();}
      else if(event.key==="Tab"){
        const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('input,button:not(:disabled),[tabindex="0"]')];
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}>{children}</div>,document.body);
}
