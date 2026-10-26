import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { activeItems, linkedSourceAudio, montageTranscript, sourceTimeAt, sourceVideoForAudio } from "../../lib/composition-playback";
import { captionSourceVideo } from "../../lib/composition-item-links";
import { synchronizeMedia } from "../../lib/composition-clock";
import { CompositionAudio } from "../../lib/composition-audio";
import { FrameSeeker, type ScrubCanvas } from "../../lib/frame-seeker";
import { SplitPreview } from "../workspace/SplitPreview";
import { isSplitScreen } from "../../lib/split-screen";
import { compositionEffectFilter, compositionOutputSize, placementStyle, visualContentStyle } from "../../lib/composition-placement";
import { CompositionCaptions } from "./CompositionCaptions";
import { useCompositionMediaReadiness, useCompositionReadiness } from "../../hooks/useCompositionMediaReadiness";
import type { CompositionReadiness } from "../../lib/composition-readiness";
import type { Composition, CompositionAsset, CompositionItem } from "../../lib/composition-types";

interface MediaProps { item:CompositionItem; asset:CompositionAsset; url:string; frame:number; document:Composition; playing:boolean;preparing:boolean; onError:(message:string)=>void;readyKey:string;readiness:CompositionReadiness }
function mediaReadyKey(item:CompositionItem,url:string|null|undefined):string{return JSON.stringify([item.id,item.kind,url??null]);}

function useMediaSource(ref:RefObject<HTMLMediaElement|null>,url:string,engine:CompositionAudio){
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    if(element.getAttribute("src")!==url){element.setAttribute("src",url);element.load();}
    return()=>{engine.detach(element);element.pause();element.removeAttribute("src");element.load();};
  },[ref,url,engine]);
}

const Visual=memo(function Visual({item,asset,url,frame,document,playing,preparing,onError,volume,engine,readyKey,readiness}:MediaProps&{volume:number;engine:CompositionAudio}){
  const video=useRef<HTMLVideoElement>(null);
  const image=useRef<HTMLImageElement>(null);
  const seeker=useRef<FrameSeeker|null>(null);
  const [scrub,setScrub]=useState<{time:number;canvas:ScrubCanvas}|null>(null);
  const time=sourceTimeAt(item,frame,document.fps);
  useEffect(()=>{
    const current=new FrameSeeker();seeker.current=current;
    return()=>{if(seeker.current===current)seeker.current=null;current.dispose();};
  },[]);
  useMediaSource(video,url,engine);
  const {checkReady,failReady}=useCompositionMediaReadiness(item.kind==="image"?image:video,readyKey,readiness,preparing);
  useEffect(()=>{
    const element=video.current;
    if(!element || item.kind==="image")return;
    let active=true;
    const sync=()=>{
      if(!active)return;
      try{
        element.muted=volume===0;engine.volume(element,volume);
        if(playing)void engine.resume().catch(()=>{if(active){failReady();onError("Não foi possível iniciar o áudio da montagem");}});
        void synchronizeMedia(element,time,playing)?.catch(()=>{if(active){failReady();onError(`Não foi possível reproduzir ${asset.name}`);}});
        checkReady();
      }
      catch{failReady();onError(`Não foi possível posicionar ${asset.name}`);}
    };
    sync();element.addEventListener("loadedmetadata",sync);
    if(!playing)void seeker.current?.getFrameAt(asset.id,url,time).then(result=>{if(active && result)setScrub({time,canvas:result});}).catch(()=>undefined);
    return()=>{active=false;element.removeEventListener("loadedmetadata",sync);};
  },[asset.id,asset.name,url,time,playing,item.kind,onError,volume,engine,checkReady,failReady]);
  const output=compositionOutputSize(document);
  const filter=compositionEffectFilter(item.settings.effects);
  const style={...visualContentStyle(asset,item.settings,output),filter};
  const split=document.settings.ratio==="9:16" && isSplitScreen(item.settings.splitScreen) && item.settings.splitScreen.faceValidated ? item.settings.splitScreen : null;
  const canvas=!playing && scrub?.time===time ? scrub.canvas : null;
  if(item.kind==="image")return <img ref={image} className="composition-stage__image" src={url} alt={asset.name} width={asset.width} height={asset.height} draggable={false} style={style} onError={()=>onError(`Não foi possível abrir ${asset.name}`)}/>;
  return <div className="composition-stage__visual" data-split={Boolean(split)}>
    <video ref={video} src={url} crossOrigin="anonymous" playsInline muted={volume===0} preload={preparing?"auto":"metadata"} style={style} aria-label={`Prévia de ${asset.name}`}
      onError={()=>onError(`Não foi possível reproduzir ${asset.name}`)}/>
    {canvas && <canvas className="composition-stage__scrub" aria-hidden="true" style={style} ref={element=>{
      if(element && canvas.width>0){element.width=canvas.width;element.height=canvas.height;element.getContext("2d")?.drawImage(canvas,0,0);}
    }}/>}
    {split && <SplitPreview video={video} layout={split} localUrl={url} filter={filter} scrub={canvas} scrubTime={time}/>}
  </div>;
});
const Audio=memo(function Audio({item,asset,url,frame,document,playing,preparing,onError,engine,readyKey,readiness}:MediaProps&{engine:CompositionAudio}){
  const ref=useRef<HTMLAudioElement>(null);
  const time=sourceTimeAt(item,frame,document.fps);
  useMediaSource(ref,url,engine);
  const {checkReady,failReady}=useCompositionMediaReadiness(ref,readyKey,readiness,preparing);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    let active=true;
    const sync=()=>{
      if(!active)return;
      try{engine.volume(element,item.settings.volume);if(playing)void engine.resume().catch(()=>{if(active){failReady();onError("Não foi possível iniciar o áudio da montagem");}});void synchronizeMedia(element,time,playing)?.catch(()=>{if(active){failReady();onError(`Não foi possível ouvir ${asset.name}`);}});checkReady();}
      catch{failReady();onError(`Não foi possível posicionar o áudio de ${asset.name}`);}
    };
    sync();element.addEventListener("loadedmetadata",sync);
    return()=>{active=false;element.removeEventListener("loadedmetadata",sync);};
  },[time,playing,item.settings.volume,asset.name,onError,engine,checkReady,failReady]);
  return <audio ref={ref} src={url} preload={preparing?"auto":"metadata"} crossOrigin="anonymous" onError={()=>onError(`Não foi possível ouvir ${asset.name}`)}/>;
});
interface Props { document:Composition; frame:number; playing:boolean; media:Record<string,{url:string|null;error:string|null}>; onError:(message:string)=>void;onReady?:(ready:boolean)=>void }
export function CompositionStage({document,frame,playing,media,onError,onReady}:Props){
  const audio=useMemo(()=>new CompositionAudio(),[]);
  const lifetime=useRef({generation:0});
  useEffect(()=>{
    const state=lifetime.current;
    const generation=++state.generation;
    return()=>{queueMicrotask(()=>{if(state.generation===generation)audio.dispose();});};
  },[audio]);
  const output=compositionOutputSize(document);
  const ratio=output.width/output.height;
  const active=activeItems(document,frame);
  const rendered=active.filter(item=>{
    if(item.kind==="caption")return false;
    const video=item.kind==="audio"?sourceVideoForAudio(document,item):undefined;
    return !video || !active.some(value=>value.id===video.id) || !media[video.assetId]?.url;
  });
  const readiness=useCompositionReadiness(rendered.map(item=>mediaReadyKey(item,media[item.assetId]?.url)),onReady);
  const buffered=useSyncExternalStore(readiness.subscribe,readiness.getSnapshot,readiness.getSnapshot);
  const entries=useMemo(()=>montageTranscript(document),[document]);
  const captions=active.filter(item=>item.kind==="caption" && item.settings.captionModel>0);
  const owners=new Map(captions.map(item=>[item.id,captionSourceVideo(document,item)?.id]));
  const captionProps={entries,document,frame,ratio};
  return <div className="composition-stage" style={{aspectRatio:ratio,background:document.settings.background,"--preview-ratio":ratio} as CSSProperties} aria-label="Prévia da montagem">
    {rendered.map(item=>{
      const asset=document.assets.find(value=>value.id===item.assetId)!;
      const entry=media[item.assetId];
      if(!entry?.url)return <p className="composition-stage__missing" key={item.id} role="status">{entry?.error??`Carregando ${asset.name}…`}</p>;
      const props={item,asset,url:entry.url,frame,document,playing:playing&&buffered,preparing:playing,onError,readiness,readyKey:mediaReadyKey(item,entry.url)};
      const key=`${item.trackId}:${item.assetId}`;
      const original=linkedSourceAudio(document,item);
      const originalTrack=document.tracks.find(track=>track.id===original?.trackId);
      const volume=original && originalTrack && !originalTrack.hidden && !originalTrack.muted && !original.settings.muted ? original.settings.volume : 0;
      return item.kind==="audio" ? <Audio key={key} {...props} engine={audio}/> : <div key={key} className="composition-stage__layer" data-composition-layer={item.id} style={placementStyle(item.placement)}><Visual {...props} engine={audio} volume={volume}/><CompositionCaptions {...captionProps} items={captions.filter(caption=>owners.get(caption.id)===item.id)}/></div>;
    })}
    <CompositionCaptions {...captionProps} items={captions.filter(caption=>!owners.get(caption.id))}/>
    {document.settings.text && <span className="workspace-preview__text">{document.settings.text}</span>}
  </div>;
}
