import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { FloppyDiskIcon } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { ClipboardIcon } from "@phosphor-icons/react/dist/csr/Clipboard";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { ScissorsIcon } from "@phosphor-icons/react/dist/csr/Scissors";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import { MusicNoteIcon } from "@phosphor-icons/react/dist/csr/MusicNote";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { SpeakerSlashIcon } from "@phosphor-icons/react/dist/csr/SpeakerSlash";
import { useCompositionImport } from "../../hooks/useCompositionImport";
import { useCompositionMediaDrop } from "../../hooks/useCompositionMediaDrop";
import { useCompositionEditor } from "../../hooks/useCompositionEditor";
import { useCompositionCommands } from "../../hooks/useCompositionCommands";
import { useCompositionPlayback } from "../../hooks/useCompositionPlayback";
import { compositionDuration } from "../../lib/composition";
import { fpsFromRate } from "../../lib/composition-time";
import { fragmentFromAsset } from "../../lib/composition-source";
import { insertComposition } from "../../lib/composition-insert";
import { EditorAction } from "./EditorAction";
import { EditorMenu, type EditorMenuItem } from "./EditorMenu";
import { CompositionTimeline, type CompositionRange } from "./CompositionTimeline";
import { CompositionToolbar } from "./CompositionToolbar";
import { CompositionEditorBody } from "./CompositionEditorBody";
import { CompositionDelivery } from "./CompositionDelivery";
import { CompositionCreatedNotice } from "./CompositionCreatedNotice";
import { CompositionPanelResize } from "./CompositionPanelResize";
import { CompositionPlaybackControls } from "./CompositionPlaybackControls";
import { detachAudio, setItemFollowsMain } from "../../lib/composition-links";
import { moveSelectionToTrack } from "../../lib/composition-arrange";
import { linkedSelection } from "../../lib/composition-operations";
import { audioSourceVideo } from "../../lib/composition-playback";
import { resolveInsertionFrame, type CompositionInsertionTarget, type CompositionSourceRequest } from "../../lib/composition-insertion-target";
import { useEditorNavigationGuard } from "../../hooks/useEditorNavigationGuard";
import { FlowDialog } from "../workspace/FlowDialog";
import type { WorkspaceData } from "../../lib/workspace-types";
import type { Composition } from "../../lib/composition-types";
import { insertAssetAtTarget,registerCompositionAsset } from "../../lib/composition-asset-drop";
import type { CompositionTimelineDropController } from "../../lib/composition-drop-controller";
import type { Clip } from "../../lib/clips";
import type { CaptionStyle } from "../../lib/captions";
import type { CompositionTrackPatch, TimelinePreviewData } from "./CompositionTrackLane";
import "./composition-editor.css";

interface Props {projectId:string;title:string;data:WorkspaceData;localUrl:string|null;onBack:()=>void;onShowClips?:()=>void;transcriptionControls?:ReactNode;allClips?:Clip[]}
export function CompositionEditor({projectId,title,data,localUrl,onBack,onShowClips,transcriptionControls,allClips}:Props){
  const editor=useCompositionEditor({projectId,clipId:data.activeClipId??null},data);
  const [selected,setSelected]=useState<string[]>([]);
  const [timelineHeight,setTimelineHeight]=useState(260);
  const [range,setRange]=useState<CompositionRange|null>(null);
  const [mode,setMode]=useState<"select"|"range">("select");
  const [magnetic,setMagnetic]=useState(true);
  const changeMode=useCallback((next:"select"|"range")=>{setMode(next);if(next==="select")setRange(null);},[]);
  const [preview,setPreview]=useState<Composition|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [leave,setLeave]=useState(false);
  const departure=useRef<(()=>void)|null>(null);
  const [created,setCreated]=useState<{projectId:string;title:string}|null>(null);
  const [menu,setMenu]=useState<{x:number;y:number;id:string}|null>(null);
  const [trackMenu,setTrackMenu]=useState<{x:number;y:number;id:string}|null>(null);
  const [notice,setNotice]=useState("");
  const [previews,setPreviews]=useState<Record<string,TimelinePreviewData>>({});
  const [sourceRequest,setSourceRequest]=useState<CompositionSourceRequest>({id:0,target:"cursor"});
  const root=useRef<HTMLElement>(null);
  const timelineDrop=useRef<CompositionTimelineDropController|null>(null);
  const document=preview??editor.document;
  const fps=useMemo(()=>fpsFromRate(),[]);
  const duration=document?compositionDuration(document):0;
  const [ready,setReady]=useState(false);
  const playback=useCompositionPlayback(document?.fps??fps,duration,ready,{preservePausedPosition:true});
  const {pause,seek}=playback;
  const requestDeparture=(action:()=>void)=>{
    pause();
    if(editor.hasUnsavedChanges()){departure.current=action;setLeave(true);}
    else action();
  };
  const cancelDeparture=()=>{departure.current=null;setLeave(false);};
  const finishDeparture=()=>{const action=departure.current;departure.current=null;setLeave(false);action?.();};
  useEffect(()=>()=>{departure.current=null;},[projectId,data.activeClipId]);
  const {apply}=editor;
  useEditorNavigationGuard({hasUnsavedChanges:editor.hasUnsavedChanges,save:editor.save,discard:editor.discard,onPause:playback.pause});
  const report=useCallback((message:string)=>{pause();setError(message);},[pause]);
  const change=useCallback((next:Composition)=>{pause();apply(next);setNotice("");},[apply,pause]);
  const changeTrack=useCallback((id:string,patch:CompositionTrackPatch)=>{
    const current=editor.document;
    if(preview||!current||!current.tracks.some(track=>track.id===id))return;
    change({...current,tracks:current.tracks.map(track=>track.id===id?{...track,...patch}:track)});
  },[editor.document,preview,change]);
  const changeMagnetic=useCallback((enabled:boolean)=>{
    if(preview)return;
    const current=editor.document;
    if(enabled&&current){
      const primary=current.tracks.find(track=>track.primary);
      const first=current.items.filter(item=>item.trackId===primary?.id).sort((a,b)=>a.startFrame-b.startFrame)[0];
      if(first&&first.startFrame>0){
        try{change(moveSelectionToTrack(current,[first.id],0,first.trackId,{magnetic:true}));seek(0);}
        catch(error){report(error instanceof Error?error.message:"Não foi possível encaixar a faixa no início");return;}
      }
    }
    setMagnetic(enabled);
  },[preview,editor.document,change,seek,report]);
  const save=async()=>{if(await editor.save())setNotice("Alterações salvas");};
  const applyAll=async(model:number,style:CaptionStyle)=>{
    playback.pause();
    if(!await editor.applyAllCaptions(allClips??[],model,style))throw new Error("Não foi possível preparar as legendas dos cortes. O rascunho foi preservado.");
    setNotice("Estilo preparado. Salve para confirmar nos cortes.");
  };
  const importer=useCompositionImport(projectId,(asset,overlay,target)=>{
    if(!editor.document)return;
    const fragment=fragmentFromAsset(editor.document,editor.document.assets.find(value=>value.id===asset.id)??asset);
    if(overlay){fragment.tracks.push({id:"overlay",name:"Sobreposição",kind:"visual",primary:false,locked:false,hidden:false,muted:false});fragment.items=fragment.items.map(item=>item.trackId==="V1"?{...item,trackId:"overlay"}:item);}
    change(insertComposition(editor.document,fragment,resolveInsertionFrame(editor.document,target,playback.frame)));
  },report,(asset,intent)=>{
    const current=editor.document;
    if(!current)return;
    if(intent.kind==="library"){const next=registerCompositionAsset(current,asset);if(next!==current)change(next);return;}
    try{change(insertAssetAtTarget(current,asset,intent.target));}
    catch(error){
      const next=registerCompositionAsset(current,asset);if(next!==current)change(next);
      report(`Mídia importada para a biblioteca. ${error instanceof Error?error.message:"Não foi possível inserir nesta faixa."}`);
    }
  },`${projectId}:${data.activeClipId??""}`);
  const mediaDrop=useCompositionMediaDrop({scope:root,timeline:timelineDrop,sessionKey:`${projectId}:${data.activeClipId??""}`,
    enabled:Boolean(editor.document)&&!preview&&!leave&&!editor.recovery&&!editor.loading&&!editor.saving&&!importer.busy,
    onPause:playback.pause,onError:report,onPath:(path,intent)=>{void importer.importPath(path,intent);},
    onAsset:(asset,target)=>{if(!editor.document)return;try{change(insertAssetAtTarget(editor.document,asset,target));}catch(error){report(error instanceof Error?error.message:"Não foi possível adicionar esta mídia.");}}});
  const commands=useCompositionCommands({document:editor.document??{version:1,revision:0,fps,settings:data.settings,assets:[],tracks:[],items:[]},selected,frame:playback.frame,range,
    scope:root,
    onChange:change,onSelect:setSelected,onRange:setRange,onSeek:playback.seek,onError:report,onSave:save,onUndo:editor.undo,onRedo:editor.redo,onTogglePlay:playback.toggle,enabled:Boolean(document)&&!preview&&!leave&&!editor.recovery&&!importer.busy});
  useEffect(()=>{
    const keys=(event:KeyboardEvent)=>{
      if(root.current&&!root.current.contains(globalThis.document.activeElement))return;
      if(event.defaultPrevented||event.ctrlKey||event.metaKey||(event.target instanceof HTMLElement && event.target.closest('input,textarea,[contenteditable="true"],dialog,[role="menu"],[data-editor-viewer="source"]')))return;
      if(event.key.toLowerCase()==="r")changeMode("range");else if(event.key.toLowerCase()==="v")changeMode("select");else if(event.key.toLowerCase()==="p"){event.preventDefault();changeMagnetic(!magnetic);}
    };
    window.addEventListener("keydown",keys);return()=>window.removeEventListener("keydown",keys);
  },[changeMagnetic,magnetic,changeMode]);
  useEffect(()=>{if(!editor.loading)root.current?.focus({preventScroll:true});},[editor.loading]);
  const onPreviews=useCallback((id:string,value:TimelinePreviewData)=>setPreviews(current=>current[id]?.frames===value.frames?current:{...current,[id]:value}),[]);
  const closeMenu=useCallback(()=>setMenu(null),[]);
  const closeTrackMenu=useCallback(()=>setTrackMenu(null),[]);
  const previewChange=useCallback((next:Composition|null,frame?:number)=>{playback.pause();setPreview(next);if(frame!==undefined)playback.seek(frame);},[playback]);
  const additionsBlocked=Boolean(preview)||leave||Boolean(editor.recovery)||importer.busy||editor.saving;
  const primaryLocked=Boolean(document?.tracks.find(track=>track.primary)?.locked);
  const additionItems=(target:CompositionInsertionTarget):EditorMenuItem[]=>[
    {label:"Vídeo na faixa principal",icon:<FilmStripIcon size={17}/>,disabled:additionsBlocked||primaryLocked,onSelect:()=>{playback.pause();void importer.pick("video",false,target);}},
    {label:"Vídeo sobreposto",icon:<FilmStripIcon size={17}/>,disabled:additionsBlocked,onSelect:()=>{playback.pause();void importer.pick("video",true,target);}},
    {label:"Imagem sobreposta",icon:<ImageIcon size={17}/>,disabled:additionsBlocked,onSelect:()=>{playback.pause();void importer.pick("image",true,target);}},
    {label:"Imagem na faixa principal",icon:<ImageIcon size={17}/>,disabled:additionsBlocked||primaryLocked,onSelect:()=>{playback.pause();void importer.pick("image",false,target);}},
    {label:"Áudio",icon:<MusicNoteIcon size={17}/>,disabled:additionsBlocked,onSelect:()=>{playback.pause();void importer.pick("audio",false,target);}},
    {label:"Escolher trecho da fonte",icon:<FilmStripIcon size={17}/>,disabled:additionsBlocked||!document?.assets.length,onSelect:()=>{playback.pause();setSourceRequest(value=>({id:value.id+1,target}));}},
  ];
  const addItems=additionItems("cursor");
  if(editor.loading)return <section className="composition-editor__state" role="status">Abrindo montagem…</section>;
  if(!document)return <section className="composition-editor__state"><p role="alert">{editor.error}</p><button type="button" className="flow-button" onClick={editor.retry}>Tentar novamente</button><button type="button" className="flow-button" onClick={onBack}>Voltar ao projeto</button></section>;
  const item=document.items.find(value=>value.id===(menu?.id??selected[0]));
  const track=document.tracks.find(value=>value.id===trackMenu?.id);
  const trackItems:EditorMenuItem[]=track?[
    {label:track.locked?"Desbloquear faixa":"Bloquear faixa",icon:<LockSimpleIcon size={17}/>,onSelect:()=>changeTrack(track.id,{locked:!track.locked})},
    track.kind==="audio"?{label:track.muted?"Ouvir faixa":"Silenciar faixa",icon:<SpeakerSlashIcon size={17}/>,onSelect:()=>changeTrack(track.id,{muted:!track.muted})}
      :{label:track.hidden?"Mostrar faixa":"Ocultar faixa",icon:<EyeSlashIcon size={17}/>,onSelect:()=>changeTrack(track.id,{hidden:!track.hidden})},
    ...(track.kind==="visual"?[{label:track.muted?"Ouvir faixa":"Silenciar faixa",icon:<SpeakerSlashIcon size={17}/>,disabled:!track.muted&&!document.items.some(value=>audioSourceVideo(document,value)?.trackId===track.id),onSelect:()=>changeTrack(track.id,{muted:!track.muted})}]:[]),
  ]:[];
  const contextItems:EditorMenuItem[]=[
    {label:"Dividir no cursor",icon:<ScissorsIcon size={17}/>,shortcut:"Ctrl+B",onSelect:commands.split},
    {label:"Excluir à esquerda do cursor",icon:<ScissorsIcon size={17}/>,shortcut:"Q",disabled:!commands.canTrimLeft,onSelect:commands.trimLeft},
    {label:"Excluir à direita do cursor",icon:<ScissorsIcon size={17}/>,shortcut:"W",disabled:!commands.canTrimRight,onSelect:commands.trimRight},
    {label:"Duplicar",icon:<CopyIcon size={17}/>,shortcut:"Ctrl+D",onSelect:commands.duplicate},
    {label:"Copiar",icon:<CopyIcon size={17}/>,shortcut:"Ctrl+C",onSelect:commands.copy},
    {label:"Colar em camada acima",icon:<ClipboardIcon size={17}/>,shortcut:"Ctrl+V",disabled:!commands.canPaste,onSelect:commands.paste},
    {label:"Colar em sequência",icon:<ClipboardIcon size={17}/>,shortcut:"Ctrl+Shift+V",disabled:!commands.canPaste,onSelect:commands.pasteInSequence},
    {label:"Mover para nova camada acima",icon:<FilmStripIcon size={17}/>,disabled:!item||!["video","image"].includes(item.kind)||document.tracks.some(value=>value.id===item.trackId&&value.locked),onSelect:()=>{
      if(!item)return;
      try{const ids=selected.includes(item.id)?selected:[item.id];const at=Math.min(...linkedSelection(document,ids).map(value=>value.startFrame));change(moveSelectionToTrack(document,ids,at,null,{magnetic:false}));}
      catch(error){report(error instanceof Error?error.message:"Não foi possível mover para outra camada");}
    }},
    {label:"Recortar",icon:<ScissorsIcon size={17}/>,shortcut:"Ctrl+X",onSelect:commands.cut},
    {label:"Excluir e fechar espaço",icon:<TrashIcon size={17}/>,shortcut:"Delete",danger:true,onSelect:()=>commands.remove()},
    {label:"Excluir mantendo espaço",icon:<TrashIcon size={17}/>,shortcut:"Shift+Delete",danger:true,onSelect:()=>commands.remove(false)},
    {label:"Desvincular áudio",icon:<MusicNoteIcon size={17}/>,disabled:!item||!document.items.some(value=>value.kind==="audio"&&value.groupId===item.groupId&&document.items.some(other=>other.id!==value.id&&other.groupId===value.groupId)),onSelect:()=>{if(!item)return;try{change(detachAudio(document,[item.id]));}catch(error){report(error instanceof Error?error.message:"Não foi possível desvincular o áudio");}}},
    {label:item?.followsMain?"Fixar na linha do tempo":"Acompanhar montagem",disabled:document.tracks.some(value=>(value.primary||value.locked)&&value.id===item?.trackId),icon:<FilmStripIcon size={17}/>,onSelect:()=>{if(item)try{change(setItemFollowsMain(document,item.id,!item.followsMain));}catch(error){report(error instanceof Error?error.message:"Não foi possível alterar o vínculo");}}},
  ];
  return <section ref={root} className="composition-editor" style={{"--composition-timeline-height":`${timelineHeight}px`} as CSSProperties} tabIndex={-1} aria-label="Editor de vídeo" data-testid="video-editor">
    <header className="composition-editor__header">
      <EditorAction compact label="Voltar ao projeto" icon={<ArrowLeftIcon size={18}/>} onClick={()=>requestDeparture(onBack)}/>
      <h1>{title}</h1><span className="composition-editor__save-state" role="status" data-testid="editor-save-status">{editor.saving?"Salvando…":editor.dirty?"Alterações não salvas":notice||"Versão salva"}</span>
      <EditorAction compact label="Desfazer (Ctrl+Z)" icon={<ArrowCounterClockwiseIcon size={18}/>} disabled={!editor.canUndo} onClick={editor.undo}/>
      <EditorAction compact label="Refazer (Ctrl+Shift+Z)" icon={<ArrowClockwiseIcon size={18}/>} disabled={!editor.canRedo} onClick={editor.redo}/>
      <EditorAction label="Salvar" icon={<FloppyDiskIcon size={18}/>} disabled={!editor.dirty||editor.saving} onClick={()=>void save()}/>
      <CompositionDelivery projectId={projectId} clipId={data.activeClipId??null} title={title} document={document} dirty={editor.dirty} saving={editor.saving} busy={Boolean(preview)||importer.busy} range={range} readSavedDocument={editor.readSavedDocument} saveForExport={editor.saveForExport} onPause={playback.pause} onError={report} onNotice={setNotice} onCreated={name=>setCreated({projectId,title:name})}/>
    </header>
    <div className="composition-editor__feedback">
      {(error||editor.error) && <div className="composition-editor__error" role="alert">{error||editor.error}<button type="button" className="flow-button" onClick={()=>{setError(null);editor.dismissError();}}>Fechar aviso</button></div>}
      {!data.activeClipId&&created?.projectId===projectId&&<CompositionCreatedNotice title={created.title} onShowClips={onShowClips?()=>requestDeparture(onShowClips):undefined} onDismiss={()=>setCreated(null)}/>}
    </div>
    <CompositionEditorBody projectId={projectId} document={document} frame={Math.min(playback.frame,Math.max(0,duration-1))} playing={playback.playing} selected={selected} sourceId={data.media?.mediaId} sourceUrl={localUrl} legacy={data}
      onChange={change} onSeek={playback.seek} onPause={playback.pause} onError={report} onPreviews={onPreviews} onPreview={setPreview} transcriptionControls={transcriptionControls} canApplyCaptions={editor.canApplyCaptions} onApplyCaptions={editor.applyCaptions} onApplyAll={allClips?.length?applyAll:undefined}
      previews={previews} sourceRequest={sourceRequest}
      onImportMedia={()=>{playback.pause();void importer.pickLibrary();}} importDisabled={additionsBlocked} libraryDropActive={mediaDrop.libraryDropActive} onAssetDrag={mediaDrop.beginAssetDrag}
      onReady={setReady} transport={<CompositionPlaybackControls frame={playback.frame} duration={duration} fps={document.fps} playing={playback.playing} buffering={playback.buffering} onToggle={playback.toggle} onSeek={playback.seek}/>}/>
    <div className="composition-editor__timeline" data-editor-viewer="montage" tabIndex={0}>
      <CompositionPanelResize value={timelineHeight} onChange={setTimelineHeight} containerRef={root}/>
      <CompositionTimeline document={document} frame={playback.frame} selected={selected} mode={mode} range={range} previews={previews} onSelect={setSelected} onRange={setRange} onSeek={playback.seek} onChange={change} onPreview={previewChange} onError={report} magnetic={magnetic} onMagneticChange={changeMagnetic} onTrackChange={preview?undefined:changeTrack}
        startAddItems={additionItems("start")} endAddItems={additionItems("end")} additionsDisabled={additionsBlocked||primaryLocked} onAddOpen={playback.pause} dropController={timelineDrop}
        toolbar={<CompositionToolbar mode={mode} onMode={changeMode} selected={Boolean(selected.length)} range={Boolean(range)} commands={commands} addItems={addItems}/>}
        onTrackContext={(event,id)=>{playback.pause();const rect=event.currentTarget.getBoundingClientRect();setMenu(null);setTrackMenu({x:rect.left,y:rect.bottom+8,id});}}
        onContext={(event,id)=>{playback.pause();setSelected([id]);setTrackMenu(null);setMenu({x:event.clientX,y:event.clientY,id});}}/>
    </div>
    {menu && <EditorMenu label="Ações do item" x={menu.x} y={menu.y} items={contextItems} onClose={closeMenu}/>}
    {trackMenu && <EditorMenu label="Opções da faixa" x={trackMenu.x} y={trackMenu.y} items={trackItems} onClose={closeTrackMenu}/>}
    <FlowDialog open={importer.busy} title={importer.kind==="image"?"Adicionando imagem":importer.kind==="audio"?"Adicionando áudio":"Adicionando vídeo"} busy allowCloseWhileBusy onClose={importer.cancel}>
      <p role="status">{importer.progress?importer.progress.copied<importer.progress.total?`Verificando arquivo ${Math.round(importer.progress.copied/Math.max(1,importer.progress.total)*100)}%` : "Analisando mídia…":"Preparando importação…"}</p>
      {importer.progress && <progress max={importer.progress.total||1} value={importer.progress.copied} aria-label="Progresso da verificação"/>}
      <div className="composition-editor__dialog-actions"><button type="button" className="flow-button" onClick={importer.cancel}>Cancelar importação</button></div>
    </FlowDialog>
    <FlowDialog open={leave} title="Salvar alterações antes de sair?" busy={editor.saving} onClose={cancelDeparture}><p>Seu rascunho ainda não foi confirmado.</p><div className="composition-editor__dialog-actions"><button type="button" className="flow-button dialog-action--secondary" onClick={cancelDeparture}>Continuar editando</button><button type="button" className="flow-button dialog-action--danger" disabled={editor.saving} onClick={()=>void editor.discard().then(ok=>{if(ok)finishDeparture();})}>Descartar e sair</button><button type="button" className="flow-button dialog-action--primary" disabled={editor.saving} onClick={()=>void editor.save().then(ok=>{if(ok&&!editor.hasUnsavedChanges())finishDeparture();})}>Salvar e sair</button></div></FlowDialog>
    <FlowDialog open={Boolean(editor.recovery)} title="Recuperar edição não salva?" onClose={()=>void editor.discard()}><p>Há um rascunho de uma sessão anterior. A versão salva permanece preservada.</p><div className="composition-editor__dialog-actions"><button type="button" className="flow-button dialog-action--danger" onClick={()=>void editor.discard()}>Descartar recuperação</button><button type="button" className="flow-button dialog-action--primary" onClick={editor.restore}>Restaurar rascunho</button></div></FlowDialog>
  </section>;
}
