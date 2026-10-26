import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { compositionDuration } from "../../lib/composition";
import { linkedSelection } from "../../lib/composition-operations";
import { linkedSourceAudio, sourceVideoForAudio } from "../../lib/composition-playback";
import { sourceVideoForCaption } from "../../lib/composition-item-links";
import { frameToSeconds } from "../../lib/composition-time";
import { scrollTimelineAtPointer } from "../../lib/composition-gesture";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { ArrowsHorizontalIcon } from "@phosphor-icons/react/dist/csr/ArrowsHorizontal";
import { MagnetIcon } from "@phosphor-icons/react/dist/csr/Magnet";
import { EditorAction } from "./EditorAction";
import { CompositionCursorControl } from "./CompositionCursorControl";
import { CompositionTrackLane, type TimelinePreviewData } from "./CompositionTrackLane";
import { useCompositionGesture } from "./useCompositionGesture";
import { useTimelineWheelZoom, type TimelineZoomPointer } from "./useTimelineWheelZoom";
import type { Composition } from "../../lib/composition-types";
import "./composition-timeline.css";

export interface CompositionRange { start: number; end: number }
interface Props {
  document: Composition; frame: number; selected: string[]; mode: "select" | "range"; range: CompositionRange | null;
  previews?: Record<string, TimelinePreviewData>;
  onSelect: (ids: string[]) => void; onRange: (range: CompositionRange | null) => void;
  onSeek: (frame: number) => void; onChange: (document: Composition) => void;
  onPreview: (document: Composition | null, frame?: number) => void; onError: (message: string) => void;
  onContext?: (event: React.MouseEvent, id: string) => void;
  onTrackContext?:(event:React.MouseEvent,id:string)=>void;
  toolbar?:ReactNode;
  magnetic?:boolean;
  onMagneticChange?:(enabled:boolean)=>void;
}
function fitScale(width:number,duration:number):number{return Math.max(1e-6,(Math.max(193,width)-192)/Math.max(1,duration));}
function zoomBounds(width:number,duration:number):[number,number]{
  const minimum=Math.min(fitScale(width,duration),Math.max(1e-6,16/Math.max(1,duration),fitScale(width,duration)/16));
  return [minimum,Math.max(minimum,Math.min(20,16_000_000/Math.max(1,duration)))];
}
export function CompositionTimeline(props: Props) {
  const { document, frame, selected, onSelect, onSeek } = props;
  const duration = compositionDuration(document);
  const timeline=useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [width,setWidth] = useState(900);
  const [scroll,setScroll] = useState(0);
  const [localMagnetic,setLocalMagnetic]=useState(true);
  const magnetic=props.magnetic??localMagnetic;
  const [scale,setScale] = useState(()=>(900-144-48)/Math.max(duration,document.fps.numerator/document.fps.denominator*10));
  const dragCleanup=useRef<(()=>void)|null>(null);
  const latest=useRef(props);
  const fitted=useRef(false);
  const pendingScroll=useRef<number|null>(null);
  useLayoutEffect(()=>{latest.current=props;},[props]);
  useLayoutEffect(()=>{
    if(pendingScroll.current===null||!viewport.current)return;
    viewport.current.scrollLeft=pendingScroll.current;
    pendingScroll.current=null;
  },[scale,scroll]);
  useEffect(()=>()=>dragCleanup.current?.(),[]);
  const gesture = useCompositionGesture({ ...props, magnetic, scale, viewport });
  const zoomTo=(next:number,left:number,available:number)=>{
    const offset=Math.max(0,Math.min(Math.max(0,192+duration*next-available),left));
    pendingScroll.current=offset;
    setScale(next);setScroll(offset);
  };
  const anchoredZoom = (next: number, pointer?:TimelineZoomPointer) => {
    fitted.current=true;
    const available=viewport.current?.clientWidth||width;
    const [minimum,maximum]=zoomBounds(available,duration);
    next=Math.max(minimum,Math.min(maximum,next));
    if(next===scale)return;
    const left=viewport.current?.scrollLeft??scroll;
    const cursor=168+frame*scale-left;
    const bounds=viewport.current?.getBoundingClientRect();
    const point=pointer&&bounds?pointer.x-bounds.left:null;
    const inside=point!==null&&point>=144&&point<=available&&pointer&&bounds&&pointer.y>=bounds.top&&pointer.y<=bounds.bottom;
    const anchor=inside?point:cursor>=144&&cursor<=available?cursor:144+(available-144)/2;
    const at=(left+anchor-168)/scale;
    zoomTo(next,168+at*next-anchor,available);
  };
  const changeZoom=(direction:number,pointer?:TimelineZoomPointer)=>anchoredZoom(scale*1.5**direction,pointer);
  useTimelineWheelZoom(timeline,changeZoom);
  const [sliderMinimum,sliderMaximum]=zoomBounds(width,duration);
  const sliderValue=sliderMaximum===sliderMinimum?0:Math.max(0,Math.min(100,Math.log(scale/sliderMinimum)/Math.log(sliderMaximum/sliderMinimum)*100));
  const fitZoom = () => {
    fitted.current=true;
    const available=viewport.current?.clientWidth||width;
    zoomTo(fitScale(available,duration),0,available);
  };
  const fitInitial=useCallback(()=>{
    const available=viewport.current?.clientWidth??0;
    const frames=compositionDuration(latest.current.document);
    if(fitted.current||available<=192||frames===0)return;
    fitted.current=true;
    setScale((available-144-48)/frames);
  },[]);
  useEffect(()=>{
    const element=viewport.current;
    if(!element)return;
    const measure=()=>{if(element.clientWidth>0){setWidth(element.clientWidth);fitInitial();}};
    const observer=typeof ResizeObserver!=="undefined" ? new ResizeObserver(measure):null;
    observer?.observe(element);
    const raf=window.requestAnimationFrame(measure);
    window.addEventListener("resize",measure);
    return()=>{observer?.disconnect();window.cancelAnimationFrame(raf);window.removeEventListener("resize",measure);};
  },[fitInitial]);
  useEffect(fitInitial,[duration,fitInitial]);
  const selectedIds=useMemo(()=>new Set(linkedSelection(document,selected).map(item=>item.id)),[document,selected]);
  const sourceAudio=useMemo(()=>new Set(document.items.filter(item=>item.kind==="video"&&linkedSourceAudio(document,item)).map(item=>item.id)),[document]);
  const sourceCaptions=useMemo(()=>{
    const videos=new Set<string>(),captions=new Set<string>();
    for(const item of document.items){if(item.kind!=="caption")continue;const video=sourceVideoForCaption(document,item);if(video){videos.add(video.id);captions.add(item.id);}}
    return {videos,captions};
  },[document]);
  const lanes=useMemo(()=>{
    const rank=(track:Composition["tracks"][number])=>track.kind==="caption"?0:track.kind==="audio"?3:track.primary?2:1;
    return document.tracks.map((track,index)=>({track,index,items:document.items.filter(item=>item.trackId===track.id&&!sourceCaptions.captions.has(item.id)&&!(item.kind==="audio"&&sourceVideoForAudio(document,item)))}))
      .filter(lane=>lane.track.kind==="visual"||lane.items.length>0)
      .sort((left,right)=>rank(left.track)-rank(right.track)||(rank(left.track)===1?right.index-left.index:left.index-right.index));
  },[document,sourceCaptions]);
  const contentWidth=Math.max(width-144,48+duration*scale);
  const secondsStep=[.1,.25,.5,1,2,5,10,15,30,60,120,300,600,1800].find(step=>step*document.fps.numerator/document.fps.denominator*scale>=90)??3600;
  const tickFrames=secondsStep*document.fps.numerator/document.fps.denominator;
  const firstTick=Math.max(0,Math.floor((scroll-24)/scale/tickFrames));
  const ticks=Array.from({length:Math.ceil((width-144)/scale/tickFrames)+2},(_,index)=>(firstTick+index)*tickFrames).filter(value=>value*scale<=contentWidth);
  const frameAt=(x:number)=>Math.max(0,Math.min(duration,Math.round((x-(viewport.current?.getBoundingClientRect().left??0)-144-24+(viewport.current?.scrollLeft??scroll))/scale)));
  const beginScrub=(event:ReactPointerEvent<HTMLElement>,rangeMode:boolean)=>{
    if(event.button!==0||duration===0)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});dragCleanup.current?.();
    const start=frameAt(event.clientX);let x=event.clientX;let raf=0;
    const update=()=>{const at=frameAt(x);latest.current.onSeek(at);if(rangeMode)latest.current.onRange({start:Math.min(Math.min(start,at),duration-1),end:Math.min(duration,Math.max(start+1,at))});};
    update();
    const tick=()=>{raf=0;const scrolled=scrollTimelineAtPointer(viewport.current,x);update();if(scrolled)raf=window.requestAnimationFrame(tick);};
    const move=(next:PointerEvent)=>{x=next.clientX;if(!raf)raf=window.requestAnimationFrame(tick);};
    const stop=()=>{window.cancelAnimationFrame(raf);window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancel);window.removeEventListener("keydown",key,true);window.removeEventListener("blur",cancel);dragCleanup.current=null;};
    const up=(next:PointerEvent)=>{x=next.clientX;stop();update();};
    const cancel=()=>{stop();latest.current.onSeek(frame);if(rangeMode)latest.current.onRange(props.range);};
    const key=(next:KeyboardEvent)=>{if(next.key==="Escape"){next.preventDefault();next.stopImmediatePropagation();cancel();}};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);window.addEventListener("keydown",key,true);window.addEventListener("blur",cancel);dragCleanup.current=stop;
  };
  return <section ref={timeline} className="composition-timeline" aria-label="Timeline da montagem" data-editor-timeline tabIndex={0} onKeyDown={event=>{
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"],[role="menu"],dialog'))return;
    if(event.key==="+"||event.key==="="){event.preventDefault();changeZoom(1);}else if(event.key==="-"||event.key==="−"){event.preventDefault();changeZoom(-1);}
    else if(event.key==="Home"||event.key==="End"){event.preventDefault();onSeek(event.key==="Home"?0:duration);}
  }}>
    <div className="composition-timeline__zoom">
      <div className="composition-timeline__actions">{props.toolbar??<span className="composition-timeline__name">Montagem</span>}
        <EditorAction compact label="Ímã da faixa principal" tooltip={`Ímã da faixa principal (P) · ${magnetic?"Ativado":"Desativado"}`} pressed={magnetic} icon={<MagnetIcon size={17} aria-hidden="true"/>}
          onClick={()=>{setLocalMagnetic(!magnetic);props.onMagneticChange?.(!magnetic);}}/>
        <CompositionCursorControl frame={frame} duration={duration} fps={document.fps} onSeek={onSeek}/>
      </div>
      <div className="composition-timeline__zoom-controls" role="group" aria-label="Zoom da timeline">
        <EditorAction compact label="Diminuir zoom" tooltip="Diminuir zoom (−)" disabled={scale<=sliderMinimum*(1+1e-9)} icon={<MinusIcon size={15} aria-hidden="true"/>} onClick={()=>changeZoom(-1)}/>
        <input type="range" aria-label="Zoom da linha do tempo" min={0} max={100} step={1} value={sliderValue} aria-valuetext={`${Math.round(scale/fitScale(width,duration)*100)}%`}
          onInput={event=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value))anchoredZoom(sliderMinimum*(sliderMaximum/sliderMinimum)**(Math.max(0,Math.min(100,value))/100));}}/>
        <EditorAction compact label="Aumentar zoom" tooltip="Aumentar zoom (+)" disabled={scale>=sliderMaximum*(1-1e-9)} icon={<PlusIcon size={15} aria-hidden="true"/>} onClick={()=>changeZoom(1)}/>
        <EditorAction compact label="Ajustar à largura" icon={<ArrowsHorizontalIcon size={15} aria-hidden="true"/>} onClick={fitZoom}/>
      </div>
    </div>
    <div ref={viewport} className="composition-timeline__viewport" onScroll={event=>setScroll(event.currentTarget.scrollLeft)}>
      <div className="composition-timeline__content" style={{width:144+contentWidth}}>
        <div className="composition-ruler"><div className="composition-track__label">Tempo de saída</div><div className="composition-ruler__ticks" style={{width:contentWidth}}
          onPointerDown={event=>beginScrub(event,false)}>
          {ticks.map(value=><span key={value} style={{left:24+value*scale}}>{new Date(frameToSeconds(value,document.fps)*1000).toISOString().slice(11,19)}</span>)}
        </div></div>
        <div className="composition-timeline__new-track" data-drop-new-track role="region" aria-label="Nova camada de vídeo"><span>Solte para criar uma camada</span></div>
        <div className="composition-timeline__lanes" onPointerDownCapture={event=>{
          if((event.target as HTMLElement).closest('.composition-track__label'))return;
          if(props.mode==="range"){beginScrub(event,true);return;}
          if(!(event.target as HTMLElement).closest('[data-composition-item],button')){onSelect([]);beginScrub(event,false);}
        }}>
          {lanes.map(({track,items})=><CompositionTrackLane key={track.id} track={track} items={items} assets={document.assets} fps={document.fps} sourceAudio={sourceAudio} sourceCaptions={sourceCaptions.videos}
            scale={scale} width={contentWidth} startPixel={scroll} visibleWidth={width-144} selected={selectedIds} previews={props.previews}
            onBegin={gesture.begin} onEdgeKey={gesture.keyboard} onSelect={onSelect} onTrackContext={props.onTrackContext} onContext={(event,item)=>props.onContext?.(event,item.id)}/>)}
        </div>
        {props.range && <div className="composition-range" aria-label="Intervalo marcado" style={{left:144+24+props.range.start*scale,width:(props.range.end-props.range.start)*scale}}/>}
        <div className="composition-playhead" aria-label="Cursor da montagem" style={{left:144+24+frame*scale}}><button type="button" aria-label="Arrastar cursor da montagem" onPointerDown={event=>beginScrub(event,false)}/></div>
      </div>
    </div>
  </section>;
}
