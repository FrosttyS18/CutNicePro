import { useState } from "react";
import { beginPointer, movePointer, keyboardTime } from "../../lib/timeline";
import { formatMediaTime } from "../../lib/workspace";
import type { EditorSettings } from "../../lib/workspace-types";
import { AudioWaveform } from "./AudioWaveform";

interface Props { duration:number; time:number; canPlay:boolean; frames:string[]; peaks:number[]; loading:boolean; hasAudio:boolean;
  settings:EditorSettings; onSeek:(time:number)=>void }

export function TimelineSurface({duration,time,canPlay,frames,peaks,loading,hasAudio,settings,onSeek}:Props) {
  const [dragging,setDragging] = useState(false);
  const enabled = canPlay && duration > 0;
  return <div className="timeline-surface" role="slider" tabIndex={enabled?0:-1}
    aria-label="Posição do vídeo" aria-valuemin={0} aria-valuemax={duration || 1} aria-valuenow={time}
    aria-valuetext={formatMediaTime(time)} aria-disabled={!enabled} data-dragging={dragging}
    onPointerDown={event=>{ if (!enabled || event.button !== 0) return; event.preventDefault(); beginPointer(event.currentTarget,event.pointerId,event.clientX,duration,onSeek); setDragging(true); }}
    onPointerMove={event=>movePointer(event.currentTarget,event.pointerId,event.clientX,duration,onSeek)}
    onPointerUp={event=>{ if (event.currentTarget.hasPointerCapture(event.pointerId)) { movePointer(event.currentTarget,event.pointerId,event.clientX,duration,onSeek); event.currentTarget.releasePointerCapture(event.pointerId); } setDragging(false); }}
    onLostPointerCapture={()=>setDragging(false)} onPointerCancel={()=>setDragging(false)}
    onKeyDown={event=>{ if (!enabled) return; const next=keyboardTime(event.key,time,duration,event.shiftKey); if(next!==null){event.preventDefault();onSeek(next);} }}>
    <div className="timeline-ruler" aria-hidden="true">{Array.from({length:11},(_,i)=><span key={i}>{formatMediaTime(duration*i/10)}</span>)}</div>
    <div className="timeline-track" aria-hidden="true">
      <div className="timeline-filmstrip">{frames.map((frame,i)=><img key={i} src={frame} alt="" width={160} height={90} draggable={false}/>)}</div>
      {!frames.length && <span>{loading?"Carregando miniaturas…":"Miniaturas indisponíveis"}</span>}
      <div className="timeline-trim-shade" style={{width:`${duration?settings.trimStart/duration*100:0}%`}}/>
      <div className="timeline-trim-shade timeline-trim-shade--end" style={{width:`${duration?(1-(settings.trimEnd??duration)/duration)*100:0}%`}}/>
    </div>
    <div className="timeline-audio" aria-hidden="true">{peaks.length ? <AudioWaveform peaks={peaks} />
      :<span>{loading?"Carregando áudio…":hasAudio?"Áudio indisponível":"Sem faixa de áudio"}</span>}</div>
    <div className="timeline-playhead" style={{left:`${duration?Math.min(1,Math.max(0,time/duration))*100:0}%`}} aria-hidden="true"><i/></div>
  </div>;
}
