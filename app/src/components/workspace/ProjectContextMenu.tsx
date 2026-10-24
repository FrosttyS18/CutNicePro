import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuIndex,menuPosition,type ProjectMenuAction,type ProjectMenuItem } from "../../lib/project-menu";

interface Props {x:number;y:number;items:ProjectMenuItem[];onSelect:(id:ProjectMenuAction)=>void;onClose:()=>void}
export function ProjectContextMenu({x,y,items,onSelect,onClose}:Props) {
  const ref=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({left:x,top:y});
  const close=useRef(onClose);
  useLayoutEffect(()=>{close.current=onClose;},[onClose]);
  useLayoutEffect(()=>{
    const rect=ref.current?.getBoundingClientRect();
    if(rect)setPosition(menuPosition(x,y,rect.width,rect.height,window.innerWidth,window.innerHeight));
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});
  },[x,y]);
  useEffect(()=>{
    function outside(event:Event){if(event.target instanceof Node&&!ref.current?.contains(event.target))close.current();}
    document.addEventListener("pointerdown",outside);window.addEventListener("resize",onClose);window.addEventListener("scroll",onClose,true);
    return ()=>{document.removeEventListener("pointerdown",outside);window.removeEventListener("resize",onClose);window.removeEventListener("scroll",onClose,true);};
  },[onClose]);
  return createPortal(<div ref={ref} className="project-context-menu" role="menu" aria-label="Ações do projeto" style={position}
    onContextMenu={event=>{event.preventDefault();event.stopPropagation();}} onKeyDown={event=>{
      const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
      if(event.key==="Escape"||event.key==="Tab"){event.preventDefault();onClose();return;}
      const next=menuIndex(event.key,buttons.indexOf(document.activeElement as HTMLButtonElement),buttons.length);
      if(next!==null){event.preventDefault();buttons[next]?.focus();}
    }}>
    {items.map(item=><button type="button" role="menuitem" key={item.id} data-danger={item.danger} onClick={()=>{onClose();onSelect(item.id);}}>
      <span>{item.label}</span>{item.detail&&<small>{item.detail}</small>}
    </button>)}
  </div>,document.body);
}
