import { useEffect, useId, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { EditorAction } from "./EditorAction";
import { frameToSeconds } from "../../lib/composition-time";
import type { FrameRate } from "../../lib/composition-types";

interface Props { frame: number; duration: number; fps: FrameRate; onSeek: (frame: number) => void }
export function CompositionCursorControl({ frame, duration, fps, onSeek }: Props) {
  const [open,setOpen]=useState(false);
  const anchor=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const id=useId();
  const seconds=frameToSeconds(frame,fps);
  const clock=new Date(seconds*1000).toISOString().slice(11,23);
  useEffect(()=>{
    if(!open)return;
    input.current?.focus();input.current?.select();
    const outside=(event:PointerEvent)=>{if(!anchor.current?.contains(event.target as Node))setOpen(false);};
    window.addEventListener("pointerdown",outside);
    return()=>window.removeEventListener("pointerdown",outside);
  },[open]);
  return <div className="composition-cursor" ref={anchor} onKeyDown={event=>{
    if(event.key!=="Escape"||!open)return;
    event.preventDefault();event.stopPropagation();setOpen(false);anchor.current?.querySelector("button")?.focus();
  }}>
    <EditorAction compact label="Posição precisa" tooltip={`Ir para um frame exato · ${clock}`} pressed={open}
      icon={<><output className="composition-timeline__time">{clock}</output><CaretDownIcon size={12} aria-hidden="true"/></>} onClick={()=>setOpen(value=>!value)}/>
    {open&&<div className="composition-cursor__popover" role="dialog" aria-label="Ajustar posição precisa">
      <label htmlFor={id}>Frame da montagem</label>
      <input ref={input} id={id} type="number" aria-label="Cursor da montagem em frames" min={0} max={duration} step={1} value={frame}
        onInput={event=>{const next=event.currentTarget.valueAsNumber;if(Number.isSafeInteger(next))onSeek(Math.max(0,Math.min(duration,next)));}}/>
      <span>0–{duration} frames</span>
    </div>}
  </div>;
}
