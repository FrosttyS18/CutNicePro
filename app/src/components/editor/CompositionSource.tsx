import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { EditorAction } from "./EditorAction";
import { formatMediaTime } from "../../lib/workspace";
import { frameToSeconds, secondsToFrame } from "../../lib/composition-time";
import type { CompositionAsset, FrameRate } from "../../lib/composition-types";

interface Props { asset:CompositionAsset; url:string|null; fps?:FrameRate; onInsert:(start:number,end:number)=>void; onActivate:()=>void }
export function CompositionSource({asset,url,fps={numerator:30,denominator:1},onInsert,onActivate}:Props){
  const ref=useRef<HTMLVideoElement>(null);
  const duration=asset.durationUs/1e6;
  const [time,setTime]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [start,setStart]=useState(0);
  const [end,setEnd]=useState(duration);
  const [error,setError]=useState<string|null>(null);
  const step=frameToSeconds(1,fps);
  const seek=(next:number)=>{const value=Math.max(0,Math.min(duration,next));if(ref.current)ref.current.currentTime=value;setTime(value);};
  const markStart=()=>{const value=Math.max(0,Math.min(frameToSeconds(secondsToFrame(time,fps),fps),duration-step));setStart(value);setEnd(previous=>Math.max(previous,Math.min(duration,value+step)));};
  const markEnd=()=>{const value=Math.min(duration,Math.max(step,frameToSeconds(secondsToFrame(time,fps),fps)));setEnd(value);setStart(previous=>Math.min(previous,Math.max(0,value-step)));};
  useEffect(()=>{
    const element=ref.current;
    if(element&&url&&element.getAttribute("src")!==url){element.setAttribute("src",url);element.load();}
    return()=>{element?.pause();element?.removeAttribute("src");element?.load();};
  },[url]);
  return <section className="composition-source" aria-label={`Fonte: ${asset.name}`} data-editor-viewer="source" tabIndex={0} onFocus={onActivate}
    onKeyDown={event=>{
      if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return;
      if(event.key===" "&&(event.target as HTMLElement).closest('button,[role="button"],a[href]'))return;
      if(event.key.toLowerCase()==="i"){event.preventDefault();markStart();}
      else if(event.key.toLowerCase()==="o"){event.preventDefault();markEnd();}
      else if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();seek(time+(event.key==="ArrowLeft"?-1:1)*step*(event.shiftKey?10:1));}
      else if(event.key==="Home"||event.key==="End"){event.preventDefault();seek(event.key==="Home"?0:duration);}
      else if(event.key===" "){event.preventDefault();if(ref.current?.paused)void ref.current.play().catch(()=>setError("Não foi possível reproduzir a fonte"));else ref.current?.pause();}
    }}>
    <h2>Fonte <span>{asset.name}</span></h2>
    {url && asset.kind==="image" ? <img src={url} alt={asset.name}/> : url ? <video ref={ref} src={url} crossOrigin="anonymous" preload="metadata" playsInline
      onTimeUpdate={event=>setTime(event.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>setError("Não foi possível reproduzir esta fonte")}/> : <p className="flow-muted">Reconecte esta mídia no projeto.</p>}
    {asset.kind!=="image" && <>
      <div className="composition-source__play"><EditorAction compact label={playing?"Pausar fonte":"Reproduzir fonte"} icon={playing?<PauseIcon size={16}/>:<PlayIcon size={16}/>} disabled={!url} onClick={()=>{if(ref.current?.paused)void ref.current.play().catch(()=>setError("Não foi possível reproduzir a fonte"));else ref.current?.pause();}}/><output>{formatMediaTime(time)} / {formatMediaTime(duration)}</output></div>
      <input className="composition-source__seek" type="range" aria-label="Posição na fonte" min={0} max={duration} step={step} value={time} onChange={event=>seek(Number(event.target.value))}
        onKeyDown={event=>{if(event.key==="Home"||event.key==="End"){event.preventDefault();seek(event.key==="Home"?0:duration);}else if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();seek(time+(event.key==="ArrowLeft"?-1:1)*step*(event.shiftKey?10:1));}}}/>
      <div className="composition-source__marks"><button type="button" className="flow-button" onClick={markStart}>Início (I) <output>{formatMediaTime(start)}</output></button><button type="button" className="flow-button" onClick={markEnd}>Fim (O) <output>{formatMediaTime(end)}</output></button></div>
    </>}
    {error && <p role="alert" className="upload-message--error">{error}</p>}
    <EditorAction label="Adicionar no cursor" icon={<PlusIcon size={16}/>} disabled={!url || asset.kind!=="image" && end<=start} onClick={()=>{ref.current?.pause();onInsert(start,end);}}/>
    <p className="flow-muted">Os pontos da fonte não alteram a montagem até você adicionar.</p>
  </section>;
}
