import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode,type RefObject } from "react";
import { compositionDuration } from "../../lib/composition";
import { linkedSelection } from "../../lib/composition-operations";
import { audioSourceVideo, linkedSourceAudio, sourceVideoForAudio } from "../../lib/composition-playback";
import { sourceVideoForCaption } from "../../lib/composition-item-links";
import { frameToSeconds } from "../../lib/composition-time";
import { scrollTimelineAtPointer } from "../../lib/composition-gesture";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { ArrowsHorizontalIcon } from "@phosphor-icons/react/dist/csr/ArrowsHorizontal";
import { MagnetIcon } from "@phosphor-icons/react/dist/csr/Magnet";
import { EditorAction } from "./EditorAction";
import { CompositionCursorControl } from "./CompositionCursorControl";
import { CompositionTimelineCursor } from "./CompositionTimelineCursor";
import { CompositionAddMenu } from "./CompositionAddMenu";
import { CompositionMarkers } from "./CompositionMarkers";
import type { EditorMenuItem } from "./EditorMenu";
import { CompositionTrackLane, type CompositionTrackPatch, type TimelinePreviewData } from "./CompositionTrackLane";
import { trackDisplayEnd } from "./composition-track-layout";
import { useCompositionGesture } from "./useCompositionGesture";
import { useTimelineWheelZoom, type TimelineZoomPointer } from "./useTimelineWheelZoom";
import type { Composition, CompositionItem } from "../../lib/composition-types";
import { compositionDropTarget,containsDropPoint,type CompositionDropPoint } from "../../lib/composition-drop-geometry";
import type { CompositionDropTarget } from "../../lib/composition-asset-drop";
import type { CompositionTimelineDropController } from "../../lib/composition-drop-controller";
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
  onTrackChange?: (id: string, patch: CompositionTrackPatch) => void;
  onMarkerEdit?:(id:string,point:{x:number;y:number})=>void;
  toolbar?:ReactNode;
  magnetic?:boolean;
  onMagneticChange?:(enabled:boolean)=>void;
  startAddItems?:EditorMenuItem[]; endAddItems?:EditorMenuItem[];
  additionsDisabled?:boolean; onAddOpen?:()=>void;
  dropController?:RefObject<CompositionTimelineDropController|null>;
}
function maximumScale(duration:number):number{return Math.max(1e-6,Math.min(20,16_000_000/Math.max(1,duration)));}
function fitScale(width:number,duration:number,inset:number):number{const padding=144+inset*2;return Math.max(1e-6,Math.min(maximumScale(duration),(Math.max(padding+1,width)-padding)/Math.max(1,duration)));}
function zoomBounds(width:number,duration:number,inset:number):[number,number]{
  const maximum=maximumScale(duration);
  const minimum=Math.max(1e-6,Math.min(maximum/16,fitScale(width,duration,inset),Math.max(1e-6,16/Math.max(1,duration),fitScale(width,duration,inset)/16)));
  return [minimum,maximum];
}
export function CompositionTimeline(props: Props) {
  const { document, frame, selected, onSelect, onSeek, onPreview } = props;
  const duration = compositionDuration(document);
  const inset=props.startAddItems||props.endAddItems?48:24;
  const extent = document.markers?.reduce((end,marker)=>Math.max(end,marker.frame),Math.max(duration,frame))??Math.max(duration,frame);
  const primaryItems=useMemo(()=>{
    const trackId=document.tracks.find(track=>track.primary)?.id;
    return document.items.filter(item=>item.trackId===trackId);
  },[document]);
  const timeline=useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [{width,height},setViewportSize] = useState({width:900,height:0});
  const [scroll,setScroll] = useState(0);
  const [focusedTrack,setFocusedTrack] = useState<string|null>(null);
  const [gesturing,setGesturing]=useState(false);
  const [localMagnetic,setLocalMagnetic]=useState(true);
  const magnetic=props.magnetic??localMagnetic;
  const [scale,setScale] = useState(()=>fitScale(900,Math.max(extent,document.fps.numerator/document.fps.denominator*10),inset));
  const dragCleanup=useRef<(()=>void)|null>(null);
  const latest=useRef(props);
  const fitted=useRef(false);
  const pendingScroll=useRef<number|null>(null);
  const pendingItemFocus=useRef<string|null>(null);
  const [dropMarker,setDropMarker]=useState<{target:CompositionDropTarget;top:number;height:number}|null>(null);
  useLayoutEffect(()=>{
    const ref=props.dropController,element=viewport.current;
    if(!ref||!element)return;
    const geometry=()=>({rect:element.getBoundingClientRect(),scrollLeft:element.scrollLeft,inset,scale,
      newTrack:element.querySelector<HTMLElement>('[data-drop-new-track]')?.getBoundingClientRect(),
      lanes:[...element.querySelectorAll<HTMLElement>('[data-composition-track]')].flatMap(lane=>{
        const track=document.tracks.find(track=>track.id===lane.dataset.compositionTrack);
        return track?[{rect:lane.getBoundingClientRect(),trackId:track.id,kind:track.kind,locked:track.locked,primary:track.primary}]:[];
      })});
    const resolve=(point:CompositionDropPoint,kind:Composition["assets"][number]["kind"])=>compositionDropTarget(geometry(),point,kind);
    const clear=()=>{element.removeAttribute("data-dragging");setDropMarker(current=>current?null:current);};
    const controller:CompositionTimelineDropController={contains:point=>containsDropPoint(element.getBoundingClientRect(),point),resolve,clear,
      hover:(point,kind)=>{
        if(!containsDropPoint(element.getBoundingClientRect(),point)){clear();return null;}
        element.setAttribute("data-dragging","true");scrollTimelineAtPointer(element,point.x);
        const current=geometry(),target=compositionDropTarget(current,point,kind);
        const rect=target?.trackId===null?current.newTrack:current.lanes.find(lane=>lane.trackId===target?.trackId)?.rect;
        const content=element.querySelector<HTMLElement>('.composition-timeline__content')?.getBoundingClientRect();
        if(!target||!rect||!content){setDropMarker(value=>value?null:value);return null;}
        const top=rect.top-content.top,height=rect.bottom-rect.top;
        setDropMarker(value=>value?.target.frame===target.frame&&value.target.trackId===target.trackId&&value.top===top&&value.height===height?value:{target,top,height});
        return target;
      }};
    ref.current=controller;
    return()=>{if(ref.current===controller)ref.current=null;element.removeAttribute("data-dragging");};
  },[props.dropController,document,scale,inset]);
  useLayoutEffect(()=>{latest.current=props;},[props]);
  useLayoutEffect(()=>{
    if(pendingScroll.current===null||!viewport.current)return;
    viewport.current.scrollLeft=pendingScroll.current;
    pendingScroll.current=null;
  },[scale,scroll]);
  useLayoutEffect(()=>{
    if(!pendingItemFocus.current)return;
    const id=pendingItemFocus.current;
    pendingItemFocus.current=null;
    const item=[...viewport.current?.querySelectorAll<HTMLElement>('[data-composition-item]')??[]].find(element=>element.dataset.compositionItem===id);
    item?.focus({preventScroll:true});
  },[scale,scroll]);
  useEffect(()=>()=>dragCleanup.current?.(),[]);
  const previewGesture=useCallback((next:Composition|null,at?:number)=>{setGesturing(next!==null);if(at===undefined)onPreview(next);else onPreview(next,at);},[onPreview]);
  const gesture = useCompositionGesture({ ...props, onPreview:previewGesture, magnetic, scale, viewport });
  const contentWidthAt=useCallback((next:number,available:number)=>Math.max(available-144,inset*2+extent*next,
    props.endAddItems?trackDisplayEnd(primaryItems,next,inset)+12+28+8:0),[extent,inset,primaryItems,props.endAddItems]);
  const zoomTo=useCallback((next:number,left:number,available:number)=>{
    const offset=Math.max(0,Math.min(Math.max(0,144+contentWidthAt(next,available)-available),left));
    pendingScroll.current=offset;
    setScale(next);setScroll(offset);
  },[contentWidthAt]);
  const anchoredZoom = useCallback((next: number, pointer?:TimelineZoomPointer) => {
    if(gesturing)return;
    fitted.current=true;
    const available=viewport.current?.clientWidth||width;
    const [minimum,maximum]=zoomBounds(available,extent,inset);
    next=Math.max(minimum,Math.min(maximum,next));
    if(next===scale)return;
    const left=viewport.current?.scrollLeft??scroll;
    const cursor=144+inset+frame*scale-left;
    const bounds=viewport.current?.getBoundingClientRect();
    const point=pointer&&bounds?pointer.x-bounds.left:null;
    const inside=point!==null&&point>=144&&point<=available&&pointer&&bounds&&pointer.y>=bounds.top&&pointer.y<=bounds.bottom;
    const anchor=inside?point:cursor>=144&&cursor<=available?cursor:144+(available-144)/2;
    const at=(left+anchor-144-inset)/scale;
    zoomTo(next,144+inset+at*next-anchor,available);
  },[extent,frame,gesturing,inset,scale,scroll,width,zoomTo]);
  const changeZoom=(direction:number,pointer?:TimelineZoomPointer)=>anchoredZoom(scale*1.5**direction,pointer);
  useTimelineWheelZoom(timeline,changeZoom);
  const [sliderMinimum,sliderMaximum]=zoomBounds(width,extent,inset);
  useLayoutEffect(()=>{
    if(fitted.current&&!gesturing&&(scale<sliderMinimum||scale>sliderMaximum))anchoredZoom(scale);
  },[scale,sliderMinimum,sliderMaximum,gesturing,anchoredZoom]);
  const sliderValue=sliderMaximum===sliderMinimum?0:Math.max(0,Math.min(100,Math.log(scale/sliderMinimum)/Math.log(sliderMaximum/sliderMinimum)*100));
  const fitZoom = () => {
    if(gesturing)return;
    fitted.current=true;
    const available=viewport.current?.clientWidth||width;
    zoomTo(fitScale(available,extent,inset),0,available);
  };
  const revealItem=(item:CompositionItem)=>{
    if(gesturing)return;
    const available=viewport.current?.clientWidth||width;
    const [minimum,maximum]=zoomBounds(available,extent,inset);
    const next=Math.max(minimum,Math.min(maximum,Math.max(scale,96/item.durationFrames)));
    fitted.current=true;
    pendingItemFocus.current=item.id;
    onSelect([item.id]);
    zoomTo(next,144+inset+(item.startFrame+item.durationFrames/2)*next-(144+(available-144)/2),available);
  };
  const fitInitial=useCallback(()=>{
    const available=viewport.current?.clientWidth??0;
    const current=latest.current;
    const frames=current.document.markers?.reduce((end,marker)=>Math.max(end,marker.frame),Math.max(compositionDuration(current.document),current.frame))??Math.max(compositionDuration(current.document),current.frame);
    if(gesturing||fitted.current||available<=144+inset*2||frames===0)return;
    fitted.current=true;
    setScale(fitScale(available,frames,inset));
  },[gesturing,inset]);
  useEffect(()=>{
    const element=viewport.current;
    if(!element)return;
    const measure=()=>{
      const width=element.clientWidth,height=element.clientHeight;
      if(width<=0)return;
      setViewportSize(size=>size.width===width&&size.height===height?size:{width,height});
      fitInitial();
    };
    const observer=typeof ResizeObserver!=="undefined" ? new ResizeObserver(measure):null;
    observer?.observe(element);
    const raf=window.requestAnimationFrame(measure);
    window.addEventListener("resize",measure);
    return()=>{observer?.disconnect();window.cancelAnimationFrame(raf);window.removeEventListener("resize",measure);};
  },[fitInitial]);
  useEffect(fitInitial,[duration,fitInitial]);
  const selectedIds=useMemo(()=>new Set(linkedSelection(document,selected).map(item=>item.id)),[document,selected]);
  const sourceAudio=useMemo(()=>new Set(document.items.filter(item=>item.kind==="video"&&linkedSourceAudio(document,item)).map(item=>item.id)),[document]);
  const sourceAudioTracks=useMemo(()=>new Set(document.items.filter(item=>item.kind==="audio").map(item=>audioSourceVideo(document,item)?.trackId).filter((id):id is string=>Boolean(id))),[document]);
  const sourceCaptions=useMemo(()=>{
    const videos=new Set<string>(),captions=new Set<string>();
    for(const item of document.items){if(item.kind!=="caption")continue;const video=sourceVideoForCaption(document,item);if(video){videos.add(video.id);captions.add(item.id);}}
    return {videos,captions};
  },[document]);
  const lanes=useMemo(()=>{
    const rank=(track:Composition["tracks"][number])=>track.primary?3:track.kind==="caption"?0:track.kind==="audio"?2:1;
    const occupiedTracks=new Set(document.items.map(item=>item.trackId));
    return document.tracks.map((track,index)=>({track,index,items:document.items.filter(item=>item.trackId===track.id&&(focusedTrack===track.id||!sourceCaptions.captions.has(item.id)&&!(item.kind==="audio"&&sourceVideoForAudio(document,item))))}))
      .filter(lane=>occupiedTracks.has(lane.track.id)?lane.track.kind==="visual"||lane.items.length>0:lane.track.primary||lane.track.locked||focusedTrack===lane.track.id)
      .sort((left,right)=>rank(left.track)-rank(right.track)||(rank(left.track)===1?right.index-left.index:left.index-right.index));
  },[document,sourceCaptions,focusedTrack]);
  const contentWidth=contentWidthAt(scale,width);
  const secondsStep=[.1,.25,.5,1,2,5,10,15,30,60,120,300,600,1800].find(step=>step*document.fps.numerator/document.fps.denominator*scale>=90)??3600;
  const tickFrames=secondsStep*document.fps.numerator/document.fps.denominator;
  const firstTick=Math.max(0,Math.floor((scroll-inset)/scale/tickFrames));
  const ticks=Array.from({length:Math.ceil((width-144)/scale/tickFrames)+2},(_,index)=>(firstTick+index)*tickFrames).filter(value=>value*scale<=contentWidth);
  const frameAt=(x:number)=>Math.max(0,Math.min(duration,Math.round((x-(viewport.current?.getBoundingClientRect().left??0)-144-inset+(viewport.current?.scrollLeft??scroll))/scale)));
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
        <input type="range" aria-label="Zoom da linha do tempo" min={0} max={100} step={1} value={sliderValue} aria-valuetext={`${Math.round(scale/fitScale(width,extent,inset)*100)}%`}
          onInput={event=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value))anchoredZoom(sliderMinimum*(sliderMaximum/sliderMinimum)**(Math.max(0,Math.min(100,value))/100));}}/>
        <EditorAction compact label="Aumentar zoom" tooltip="Aumentar zoom (+)" disabled={scale>=sliderMaximum*(1-1e-9)} icon={<PlusIcon size={15} aria-hidden="true"/>} onClick={()=>changeZoom(1)}/>
        <EditorAction compact label="Ajustar à largura" icon={<ArrowsHorizontalIcon size={15} aria-hidden="true"/>} onClick={fitZoom}/>
      </div>
    </div>
    <div className="composition-timeline__scroll-area">
      <div ref={viewport} className="composition-timeline__viewport" onScroll={event=>{setScroll(event.currentTarget.scrollLeft);setDropMarker(current=>current?null:current);}}>
      <div className="composition-timeline__content" style={{width:144+contentWidth,minHeight:height||140}}>
        <div className="composition-ruler"><div className="composition-track__label">Tempo de saída</div><div className="composition-ruler__ticks" style={{width:contentWidth}}
          onPointerDown={event=>beginScrub(event,false)}>
          {ticks.map(value=><span key={value} style={{left:inset+value*scale}}>{new Date(frameToSeconds(value,document.fps)*1000).toISOString().slice(11,19)}</span>)}
          {props.onMarkerEdit&&<CompositionMarkers markers={document.markers??[]} fps={document.fps} inset={inset} scale={scale} scroll={scroll} width={width} onSeek={onSeek} onEdit={props.onMarkerEdit}/>}
        </div></div>
        <div className="composition-timeline__new-track" data-drop-new-track role="region" aria-label="Nova camada de vídeo"><span>Solte para criar uma camada</span></div>
        <div className="composition-timeline__lanes" onPointerDownCapture={event=>{
          if((event.target as HTMLElement).closest('.composition-track__label,.composition-track__add'))return;
          if(props.mode==="range"){beginScrub(event,true);return;}
          if(!(event.target as HTMLElement).closest('[data-composition-item],button')){onSelect([]);beginScrub(event,false);}
        }}>
          {lanes.map(({track,items})=><CompositionTrackLane key={track.id} track={track} items={items} assets={document.assets} fps={document.fps} sourceAudio={sourceAudio} sourceCaptions={sourceCaptions.videos}
            scale={scale} width={contentWidth} inset={inset} startPixel={scroll} visibleWidth={width-144} selected={selectedIds} previews={props.previews}
            startAddition={track.primary&&props.startAddItems?<CompositionAddMenu label="Adicionar no início" items={props.startAddItems} disabled={props.additionsDisabled||track.locked} onOpen={props.onAddOpen}/>:undefined}
            endAddition={track.primary&&props.endAddItems?<CompositionAddMenu label="Adicionar no fim" items={props.endAddItems} disabled={props.additionsDisabled||track.locked} onOpen={props.onAddOpen}/>:undefined}
            onBegin={gesture.begin} onEdgeKey={gesture.keyboard} onSelect={onSelect} onReveal={revealItem} onTrackContext={props.onTrackContext} onTrackChange={props.onTrackChange} onTrackFocus={setFocusedTrack} canMuteSource={sourceAudioTracks.has(track.id)} onContext={(event,item)=>props.onContext?.(event,item.id)}/>)}
        </div>
        {props.range && <div className="composition-range" aria-label="Intervalo marcado" style={{left:144+inset+props.range.start*scale,width:(props.range.end-props.range.start)*scale}}/>}
        {dropMarker&&<div className="composition-range" aria-label="Ponto de inserção" style={{left:144+inset+dropMarker.target.frame*scale,width:2,top:dropMarker.top,height:dropMarker.height,bottom:"auto"}}/>}
      </div>
      </div>
      <CompositionTimelineCursor frame={frame} duration={duration} left={144+inset+frame*scale-scroll} width={width} height={height}
        onSeek={onSeek} onPointerDown={event=>beginScrub(event,false)}/>
    </div>
  </section>;
}
