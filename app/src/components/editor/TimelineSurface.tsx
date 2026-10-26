import { useEffect, useMemo, useRef, useState } from "react";
import { beginPointer, movePointer, keyboardTime } from "../../lib/timeline";
import { formatMediaTime } from "../../lib/workspace";
import type { EditSegment, EditorSettings } from "../../lib/workspace-types";
import { AudioWaveform } from "./AudioWaveform";
import { planIsValid, segmentIndexAt, type TrimEdge } from "../../lib/edit-plan";
import { TimelineSegments } from "./TimelineSegments";
import { useTimelineTrim } from "./useTimelineTrim";

interface Props { duration:number; time:number; canPlay:boolean; frames:string[]; peaks:number[]; loading:boolean; hasAudio:boolean;
  settings:EditorSettings; onSeek:(time:number)=>void;
  /** Segmentos do plano de edição (tempo da FONTE): os vãos ficam sombreados
   *  como o trim faz hoje — mesma linguagem visual, sem novos contornos. */
  segments?: EditSegment[] | null;
  selectedSegment?: number;
  onSelectSegment?: (index: number) => void;
  onTrimCommit?: (index: number, edge: TrimEdge, value: number) => void }

/** Vãos = complemento do plano dentro de [0, duration] (ordenado). */
function gapsOf(segments: EditSegment[], duration: number): EditSegment[] {
  const gaps: EditSegment[] = [];
  let cursor = 0;
  for (const s of segments) {
    if (s.sourceStart > cursor + 1e-6) gaps.push({ sourceStart: cursor, sourceEnd: s.sourceStart });
    cursor = Math.max(cursor, s.sourceEnd);
  }
  if (duration > cursor + 1e-6) gaps.push({ sourceStart: cursor, sourceEnd: duration });
  return gaps;
}

export function TimelineSurface({duration,time,canPlay,frames,peaks,loading,hasAudio,settings,onSeek,segments,selectedSegment=0,onSelectSegment,onTrimCommit}:Props) {
  const [dragging,setDragging] = useState(false);
  const seekRaf = useRef(0);
  const draggingRef = useRef(false);
  const latestPointer = useRef<{ target: HTMLDivElement; id: number; x: number } | null>(null);
  const slider = useRef<HTMLDivElement>(null);
  useEffect(() => () => cancelAnimationFrame(seekRaf.current), []);
  const enabled = canPlay && duration > 0;
  const sourceSegments = useMemo(() => segments ?? [{ sourceStart: settings.trimStart, sourceEnd: settings.trimEnd ?? duration }],
    [segments, settings.trimStart, settings.trimEnd, duration]);
  const trim = useTimelineTrim({ segments: sourceSegments, duration, enabled, onCommit: onTrimCommit, onSelect: index => onSelectSegment?.(index) });
  const seek = (time: number) => {
    const index = segmentIndexAt(sourceSegments, time);
    if (index >= 0) onSelectSegment?.(index);
    onSeek(time);
  };
  const cancelSeek = () => { cancelAnimationFrame(seekRaf.current); seekRaf.current = 0; latestPointer.current = null; draggingRef.current = false; setDragging(false); };
  return <div className="timeline-surface" data-dragging={dragging}
    onPointerDown={event=>{ if (!enabled || event.button !== 0) return; event.preventDefault(); draggingRef.current = true; beginPointer(event.currentTarget,event.pointerId,event.clientX,duration,seek); slider.current?.focus({preventScroll:true}); setDragging(true); }}
    onPointerMove={event=>{
      if (!draggingRef.current) return;
      latestPointer.current = { target: event.currentTarget, id: event.pointerId, x: event.clientX };
      if (!seekRaf.current) {
        seekRaf.current = requestAnimationFrame(() => {
          seekRaf.current = 0;
          const pointer = latestPointer.current;
          if (pointer && draggingRef.current) movePointer(pointer.target, pointer.id, pointer.x, duration, seek);
        });
      }
    }}
    onPointerUp={event=>{ if (event.currentTarget.hasPointerCapture(event.pointerId)) { movePointer(event.currentTarget,event.pointerId,event.clientX,duration,seek); event.currentTarget.releasePointerCapture(event.pointerId); } cancelSeek(); }}
    onLostPointerCapture={cancelSeek} onPointerCancel={cancelSeek}>
    <div className="timeline-ruler" aria-hidden="true">{Array.from({length:11},(_,i)=><span key={i}>{formatMediaTime(duration*i/10)}</span>)}</div>
    <div className="timeline-media">
    <div ref={slider} className="timeline-seek-surface" role="slider" tabIndex={enabled?0:-1}
    aria-label="Posição do vídeo" aria-valuemin={0} aria-valuemax={duration || 1} aria-valuenow={time}
    aria-valuetext={formatMediaTime(time)} aria-disabled={!enabled}
    onKeyDown={event=>{ if (!enabled) return; const next=keyboardTime(event.key,time,duration,event.shiftKey); if(next!==null){event.preventDefault();seek(next);} }}>
    <div className="timeline-track" aria-hidden="true">
      <div className="timeline-filmstrip">{frames.map((frame,i)=><img key={i} src={frame} alt="" width={160} height={90} draggable={false}/>)}</div>
      {!frames.length && <span>{loading?"Carregando miniaturas…":"Miniaturas indisponíveis"}</span>}
      {trim.displayed.length
        ? gapsOf(trim.displayed, duration).map((gap, i) => (
          <div key={i} className="timeline-trim-shade"
            style={{ left: `${duration ? gap.sourceStart / duration * 100 : 0}%`, width: `${duration ? (gap.sourceEnd - gap.sourceStart) / duration * 100 : 0}%` }}/>))
        : <>
          <div className="timeline-trim-shade" style={{width:`${duration?settings.trimStart/duration*100:0}%`}}/>
          <div className="timeline-trim-shade timeline-trim-shade--end" style={{width:`${duration?(1-(settings.trimEnd??duration)/duration)*100:0}%`}}/>
        </>}
    </div>
    <div className="timeline-audio" aria-hidden="true">{peaks.length ? <AudioWaveform peaks={peaks} />
      :<span>{loading?"Carregando áudio…":hasAudio?"Áudio indisponível":"Sem faixa de áudio"}</span>}</div>
    </div>
    {enabled && onTrimCommit && planIsValid(trim.displayed, duration) && <TimelineSegments segments={trim.displayed} duration={duration}
      selected={selectedSegment} onSelect={index => onSelectSegment?.(index)} trim={trim}/>}
    </div>
    <div className="timeline-playhead" style={{left:`${duration?Math.min(1,Math.max(0,time/duration))*100:0}%`}} aria-hidden="true"><i/></div>
  </div>;
}
