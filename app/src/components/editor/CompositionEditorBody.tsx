import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useCompositionMedia } from "../../hooks/useCompositionMedia";
import { useTimelinePreview } from "../../hooks/useTimelinePreview";
import { montageTranscript, sourceTimeAt } from "../../lib/composition-playback";
import { compositionContextItem, transcriptForItem } from "../../lib/composition-transcript-context";
import { formatMediaTime } from "../../lib/workspace";
import { splitViewport } from "../../lib/split-screen";
import { fragmentFromAsset } from "../../lib/composition-source";
import { insertComposition } from "../../lib/composition-insert";
import { linkedSelection } from "../../lib/composition-operations";
import { frameToSeconds } from "../../lib/composition-time";
import { editTranscriptSegment } from "../../lib/transcript-text";
import { applyMontageCaptionStyle } from "../../lib/composition-captions";
import type { CaptionStyle } from "../../lib/captions";
import { ClosedCaptioningIcon } from "@phosphor-icons/react/dist/csr/ClosedCaptioning";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { SidebarSimpleIcon } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { TextAlignLeftIcon } from "@phosphor-icons/react/dist/csr/TextAlignLeft";
import { CropIcon } from "@phosphor-icons/react/dist/csr/Crop";
import { EditorAction } from "./EditorAction";
import { EditorInspector, type EditorPanel } from "./EditorInspector";
import { CompositionStage } from "./CompositionStage";
import { CompositionSource } from "./CompositionSource";
import { useCompositionFraming } from "./useCompositionFraming";
import { CompositionPlacementControls } from "./CompositionPlacementControls";
import { CompositionSidePanel } from "./CompositionSidePanel";
import { CompositionMediaLibrary } from "./CompositionMediaLibrary";
import type { EditorMenuItem } from "./EditorMenu";
import { TranscriptPanel } from "../workspace/TranscriptPanel";
import type { Composition, CompositionAsset, CompositionPlacement } from "../../lib/composition-types";
import type { EditorSettings, TranscriptWord, WorkspaceData } from "../../lib/workspace-types";
import type { TimelinePreviewData } from "./CompositionTrackLane";

function PreviewLoader({asset,onData}:{asset:CompositionAsset;onData:(id:string,data:TimelinePreviewData)=>void}){
  const preview=useTimelinePreview(asset.kind!=="image"?asset.mediaId:undefined);
  useEffect(()=>{if(preview.frames.length || preview.peaks.length)onData(asset.id,{frames:preview.frames,peaks:preview.peaks});},[asset.id,preview.frames,preview.peaks,onData]);
  return preview.error ? <p className="flow-muted" role="status">{asset.name}: {preview.error}</p> : null;
}
interface Props {projectId:string;document:Composition;frame:number;playing:boolean;selected:string[];sourceId?:string;sourceUrl:string|null;legacy:WorkspaceData;
  onChange:(document:Composition)=>void;onSeek:(frame:number)=>void;onPause:()=>void;onError:(message:string)=>void;
  onPreviews:(id:string,data:TimelinePreviewData)=>void;
  onReady?:(ready:boolean)=>void;
  onPreview:(document:Composition|null)=>void;
  transcriptionControls?:ReactNode;canApplyCaptions?:boolean;onApplyCaptions?:()=>unknown;
  onApplyAll?:(model:number,style:CaptionStyle)=>Promise<void>;
  previews?:Record<string,TimelinePreviewData>;addItems?:EditorMenuItem[];transport?:ReactNode;sourceRequest?:number;
}
export function CompositionEditorBody({projectId,document,frame,playing,selected,sourceId,sourceUrl,legacy,onChange,onSeek,onPause,onError,onPreviews,onPreview,onReady,transcriptionControls,canApplyCaptions,onApplyCaptions,onApplyAll,previews={},addItems=[],transport,sourceRequest=0}:Props){
  const media=useCompositionMedia(document.assets,sourceId,sourceUrl);
  const [tab,setTab]=useState<"media"|"transcript">("media");
  const [source,setSource]=useState<string|null>(document.assets[0]?.id??null);
  const [sourceOpen,setSourceOpen]=useState(false);
  const [libraryOpen,setLibraryOpen]=useState(true);
  const [inspectorOpen,setInspectorOpen]=useState(true);
  const [libraryWidth,setLibraryWidth]=useState(288);
  const [inspectorWidth,setInspectorWidth]=useState(320);
  const [handledSourceRequest,setHandledSourceRequest]=useState(0);
  const panelId=useId();
  const stage=useRef<HTMLDivElement>(null);
  const [panel,setPanel]=useState<EditorPanel>("captions");
  const [framing,setFraming]=useState(false);
  const entries=useMemo(()=>montageTranscript(document),[document]);
  const [transcriptFrame,setTranscriptFrame]=useState(frame);
  const latestFrame=useRef(frame);
  useEffect(()=>{latestFrame.current=frame;},[frame]);
  useEffect(()=>{
    if(tab!=="transcript" || !libraryOpen)return;
    setTranscriptFrame(latestFrame.current);
    const timer=setInterval(()=>setTranscriptFrame(latestFrame.current),120);return()=>clearInterval(timer);
  },[tab,libraryOpen]);
  const sourceAsset=document.assets.find(asset=>asset.id===source)??document.assets[0];
  const viewingSource=sourceOpen&&Boolean(sourceAsset);
  if(sourceRequest!==handledSourceRequest){
    setHandledSourceRequest(sourceRequest);
    if(sourceRequest>0){setTab("media");setSourceOpen(true);setLibraryOpen(true);}
  }
  useEffect(()=>{
    if(!framing)return;
    const stop=(event:KeyboardEvent)=>{if(event.key==="Escape")setFraming(false);};
    window.addEventListener("keydown",stop);return()=>window.removeEventListener("keydown",stop);
  },[framing]);
  const openSource=(asset:CompositionAsset)=>{onPause();setSource(asset.id);setSourceOpen(true);};
  const insertSource=(asset:CompositionAsset,start=0,end=asset.durationUs/1e6)=>{
    try{onPause();onChange(insertComposition(document,fragmentFromAsset(document,asset,start,end,asset.mediaId!==sourceId||document.items.some(value=>value.kind==="audio"&&value.assetId===asset.id)),frame));return true;}
    catch(error){onError(error instanceof Error?error.message:"Não foi possível adicionar a fonte");return false;}
  };
  const item=compositionContextItem(document,frame,selected);
  const transcriptItemId=item?String(item.id):undefined;
  const transcriptSegments=useMemo(()=>transcriptForItem(document,entries,document.items.find(value=>value.id===transcriptItemId)).map(entry=>entry.segment),[document,entries,transcriptItemId]);
  const seekTranscript=useCallback((seconds:number)=>onSeek(Math.round(seconds*document.fps.numerator/document.fps.denominator)),[onSeek,document.fps]);
  const itemAsset=document.assets.find(asset=>asset.id===item?.assetId);
  const itemTrack=document.tracks.find(track=>track.id===item?.trackId);
  const overlay=item && selected.includes(item.id) && (item.kind==="image" || item.kind==="video") && itemTrack && !itemTrack.primary ? item : undefined;
  const settings={...(item?.settings??document.settings),ratio:document.settings.ratio,text:document.settings.text,background:document.settings.background};
  const pointer=useCompositionFraming({document,item,time:item?sourceTimeAt(item,frame,document.fps):0,enabled:framing||Boolean(overlay),mode:framing?"crop":"placement",onPreview,onChange,onError});
  const changePlacement=(placement:CompositionPlacement)=>{
    if(!overlay)return;
    if(itemTrack?.locked){onError("A faixa selecionada está bloqueada");return;}
    onChange({...document,items:document.items.map(value=>value.id===overlay.id?{...value,placement}:value)});
  };
  const changeSettings=(patch:Partial<EditorSettings>)=>{
    const {text,background,...itemPatch}=patch;
    const changesItems=Object.keys(itemPatch).length>0;
    const ids=new Set(linkedSelection(document,selected.length?selected:item?[item.id]:[]).map(value=>value.id));
    if(changesItems&&document.items.some(value=>ids.has(value.id)&&document.tracks.find(track=>track.id===value.trackId)?.locked)){onError("A faixa selecionada está bloqueada");return;}
    const global={...document.settings,...(!item?patch:{}),...(patch.ratio?{ratio:patch.ratio}:{}),...(text!==undefined?{text}:{}),...(background!==undefined?{background}:{})};
    onChange({...document,settings:global,items:changesItems?document.items.map(value=>ids.has(value.id)?{...value,settings:{...value.settings,...itemPatch}}:value):document.items});
  };
  const editCaption=useCallback((id:string,text:string,words?:TranscriptWord[])=>{
    const entry=entries.find(value=>value.segment.id===id);if(!entry)return;
    const target=document.items.find(value=>value.id===entry.itemId)!;
    if(document.tracks.find(track=>track.id===target.trackId)?.locked){onError("A faixa de legendas está bloqueada");return;}
    const offset=target.sourceStartUs/1e6-frameToSeconds(target.startFrame,document.fps);
    const timed=words??editTranscriptSegment(entry.segment,text).words;
    const override={text,words:timed?.map(word=>({...word,start:word.start+offset,end:word.end+offset}))};
    onChange({...document,items:document.items.map(value=>value.id===entry.itemId ? {...value,captionEdits:{...value.captionEdits,[entry.sourceSegmentId]:override}}:value)});
  },[document,entries,onChange,onError]);
  const applyStyle=async(model:number,style:CaptionStyle)=>{
    try{onPause();onChange(applyMontageCaptionStyle(document,model,style));}
    catch(error){onError(error instanceof Error?error.message:"Não foi possível aplicar o estilo à montagem");throw error;}
  };
  return <div className="composition-editor__body" data-library-open={libraryOpen} data-inspector-open={inspectorOpen}
    style={{"--composition-library-width":`${libraryWidth}px`,"--composition-inspector-width":`${inspectorWidth}px`} as CSSProperties}>
    {libraryOpen && <CompositionSidePanel side="library" label="Biblioteca" width={libraryWidth} minimum={240} maximum={480} expanded={libraryWidth>320}
      onWidth={setLibraryWidth} onExpand={()=>setLibraryWidth(width=>width>320?288:440)} onClose={()=>{setLibraryOpen(false);stage.current?.focus({preventScroll:true});}}>
      <aside className="composition-editor__library" aria-label="Mídias e transcrição">
      <div className="composition-editor__tabs" role="tablist" aria-label="Conteúdo do editor" onKeyDown={event=>{
        if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
        event.preventDefault();const next=event.key==="Home"?"media":event.key==="End"?"transcript":tab==="media"?"transcript":"media";
        setTab(next);if(next==="transcript")setSourceOpen(false);event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
      }}>
        <button type="button" role="tab" id={`${panelId}-media-tab`} data-tab="media" aria-controls={`${panelId}-media`} tabIndex={tab==="media"?0:-1} aria-selected={tab==="media"} onClick={()=>setTab("media")}><FilmStripIcon size={17} aria-hidden="true"/>Mídia</button>
        <button type="button" role="tab" id={`${panelId}-transcript-tab`} data-tab="transcript" aria-controls={`${panelId}-transcript`} tabIndex={tab==="transcript"?0:-1} aria-selected={tab==="transcript"} onClick={()=>{setSourceOpen(false);setTab("transcript");}}><TextAlignLeftIcon size={17} aria-hidden="true"/>Transcrição</button>
      </div>
      <div role="tabpanel" id={`${panelId}-media`} aria-labelledby={`${panelId}-media-tab`} hidden={tab!=="media"} className="composition-editor__sources">
        <CompositionMediaLibrary assets={document.assets} selectedId={sourceAsset?.id} previews={previews} media={media} addItems={addItems}
          onSelect={asset=>setSource(asset.id)} onOpen={openSource} onInsert={asset=>insertSource(asset)}/>
      </div>
      <div role="tabpanel" id={`${panelId}-transcript`} aria-labelledby={`${panelId}-transcript-tab`} hidden={tab!=="transcript"} className="composition-editor__transcript">
        {!entries.length&&transcriptionControls}
        {canApplyCaptions&&onApplyCaptions&&<div className="studio-section"><p className="flow-muted">A transcrição da fonte está disponível. Aplicar adiciona uma edição ao rascunho atual.</p>
          <EditorAction label="Aplicar legendas à montagem" icon={<ClosedCaptioningIcon size={16} aria-hidden="true"/>} onClick={()=>{onPause();onApplyCaptions();}}/>
        </div>}
        {item&&<p className="flow-muted" role="status">{itemAsset?.name} · {formatMediaTime(frameToSeconds(item.startFrame,document.fps))}–{formatMediaTime(frameToSeconds(item.startFrame+item.durationFrames,document.fps))} na montagem</p>}
        <TranscriptPanel segments={transcriptSegments} contextKey={transcriptItemId} demo={false} currentTime={frameToSeconds(transcriptFrame,document.fps)} canSeek generated={legacy.transcriptMode==="real"} onSeek={seekTranscript} onText={editCaption}/>
      </div>
      </aside>
    </CompositionSidePanel>}
    <div ref={stage} className="composition-editor__stage" data-editor-viewer={viewingSource?"source":"montage"} tabIndex={0}>
      <div className="composition-editor__viewer-label"><span>{viewingSource?`Fonte · ${sourceAsset?.name}`:"Prévia da montagem"}</span><div className="composition-editor__panel-toggles">
        {viewingSource&&<EditorAction compact label="Voltar à montagem" icon={<ArrowLeftIcon size={16} aria-hidden="true"/>} onClick={()=>{setSourceOpen(false);stage.current?.focus({preventScroll:true});}}/>}
        {!libraryOpen&&<EditorAction compact label="Mostrar biblioteca" icon={<SidebarSimpleIcon size={18} aria-hidden="true"/>} onClick={()=>setLibraryOpen(true)}/>}
        {!inspectorOpen&&<EditorAction compact label="Mostrar propriedades" icon={<SlidersHorizontalIcon size={18} aria-hidden="true"/>} onClick={()=>setInspectorOpen(true)}/>}
      </div></div>
      {viewingSource&&sourceAsset ? <div className="composition-editor__source-view"><CompositionSource key={sourceAsset.id} asset={sourceAsset} fps={document.fps} url={media[sourceAsset.id]?.url??null} onActivate={onPause}
        onInsert={(start,end)=>{if(insertSource(sourceAsset,start,end)){setSourceOpen(false);stage.current?.focus({preventScroll:true});}}}/></div>
        : <div className="composition-editor__canvas" data-framing={framing} data-placement={Boolean(overlay)&&!framing} onPointerDown={pointer}><CompositionStage document={document} frame={frame} playing={playing} media={media} onError={onError} onReady={onReady}/></div>}
      <div className="composition-editor__preview-status">{document.assets.map(asset=><PreviewLoader key={asset.id} asset={asset} onData={onPreviews}/>)}</div>
      {!viewingSource&&transport&&<div className="composition-editor__viewer-transport">{transport}</div>}
    </div>
    {inspectorOpen&&<CompositionSidePanel side="inspector" label="Propriedades" width={inspectorWidth} minimum={280} maximum={480} expanded={inspectorWidth>360}
      onWidth={setInspectorWidth} onExpand={()=>setInspectorWidth(width=>width>360?320:440)} onClose={()=>{setFraming(false);setInspectorOpen(false);stage.current?.focus({preventScroll:true});}}>
    <EditorInspector panel={panel} settings={settings} onPanel={next=>{onPause();setPanel(next);setFraming(next==="reframe");}} onSettings={changeSettings} sourceTime={item?sourceTimeAt(item,frame,document.fps):0}
      onApplyMontage={applyStyle} onApplyAll={onApplyAll} applyAllUnavailableReason={!onApplyAll?"Outros cortes salvos continuam independentes. Abra cada corte para alterar seu estilo.":undefined}
      reframeContent={<><div className="composition-editor__framing"><EditorAction label={framing?"Concluir ajuste":"Ajustar na prévia"} pressed={framing} icon={<CropIcon size={16} aria-hidden="true"/>} onClick={()=>{onPause();setFraming(active=>!active);}}/></div>{overlay&&<CompositionPlacementControls placement={overlay.placement} disabled={Boolean(itemTrack?.locked)} cropping={framing} onChange={changePlacement}/>}</>}
      source={item&&itemAsset?.kind==="video"?{projectId,mediaId:itemAsset.mediaId,start:item.sourceStartUs/1e6,end:item.sourceEndUs/1e6,viewport:splitViewport(itemAsset.width,itemAsset.height,settings)}:undefined}/>
    </CompositionSidePanel>}
  </div>;
}
