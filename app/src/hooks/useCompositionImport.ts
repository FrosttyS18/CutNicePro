import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { importMedia } from "../lib/ipc";
import type { CompositionAsset, MediaKind } from "../lib/composition-types";
import { MEDIA_FILE_EXTENSIONS } from "../lib/media-file-types";
import type { CompositionInsertionTarget } from "../lib/composition-insertion-target";
import { compositionMediaKind,type CompositionImportIntent } from "../lib/composition-import-intent";

export function useCompositionImport(projectId:string,onComplete:(asset:CompositionAsset,overlay:boolean,target:CompositionInsertionTarget)=>void,onError:(message:string)=>void,onImported?:(asset:CompositionAsset,intent:CompositionImportIntent)=>void,sessionKey=projectId){
  const callbacks=useRef({onComplete,onError,onImported});
  useLayoutEffect(()=>{callbacks.current={onComplete,onError,onImported};},[onComplete,onError,onImported]);
  const controller=useRef<AbortController|null>(null);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState<{copied:number;total:number}|null>(null);
  const [kind,setKind]=useState<MediaKind>("video");
  const scope=JSON.stringify([projectId,sessionKey]);
  const activeScope=useRef<string|null>(scope);
  const [requestedScope,setRequestedScope]=useState(scope);
  if(requestedScope!==scope){setRequestedScope(scope);setBusy(false);setProgress(null);setKind("video");}
  useLayoutEffect(()=>{
    activeScope.current=scope;
    return()=>{activeScope.current=null;controller.current?.abort();controller.current=null;};
  },[scope]);
  const run=useCallback(async(choose:()=>Promise<string|null>,requestedKind?:MediaKind,intent?:CompositionImportIntent,overlay=false,target:CompositionInsertionTarget="cursor")=>{
    if(controller.current||activeScope.current!==scope)return;
    const operation=new AbortController();controller.current=operation;
    try {
      const path=await choose();
      if(typeof path!=="string"||operation.signal.aborted||activeScope.current!==scope)return;
      const kind=requestedKind??compositionMediaKind(path);
      if(!kind)throw new Error("Formato não suportado. Escolha um vídeo, imagem ou áudio compatível.");
      setKind(kind);setBusy(true);setProgress(null);
      const result=await importMedia(projectId,path,(copied,total)=>{if(controller.current===operation&&activeScope.current===scope)setProgress({copied,total});},operation.signal,kind);
      if(controller.current!==operation||activeScope.current!==scope)return;
      const {entry,analysisError}=result;const analysis=entry.analysis;
      if(analysisError||!analysis)throw new Error(analysisError??"Não foi possível analisar esta mídia");
      if(kind==="audio" ? !analysis.hasAudio||analysis.durationMs<=0 : analysis.width<=0||analysis.height<=0||kind==="video"&&analysis.durationMs<=0)throw new Error("O arquivo não corresponde ao tipo de mídia escolhido");
      const asset:CompositionAsset={id:entry.mediaId,mediaId:entry.mediaId,name:entry.originalName,kind,durationUs:analysis.durationMs*1000,width:analysis.width,height:analysis.height,transcript:[],hasAudio:analysis.hasAudio};
      if(intent)callbacks.current.onImported?.(asset,intent);else callbacks.current.onComplete(asset,overlay,target);
    } catch(error){if(!operation.signal.aborted&&activeScope.current===scope)callbacks.current.onError(error instanceof Error?error.message:typeof error==="string"?error:"Não foi possível importar esta mídia");}
    finally {if(controller.current===operation){controller.current=null;setBusy(false);setProgress(null);}}
  },[projectId,scope]);
  const pick=useCallback((kind:MediaKind,overlay=false,target:CompositionInsertionTarget="cursor")=>run(async()=>{
    const path=await open({multiple:false,directory:false,filters:[{name:kind==="image"?"Imagens":kind==="audio"?"Áudio":"Vídeos",extensions:MEDIA_FILE_EXTENSIONS[kind]}]});
    return typeof path==="string"?path:null;
  },kind,undefined,overlay,target),[run]);
  const pickLibrary=useCallback(()=>run(async()=>{
    const path=await open({multiple:false,directory:false,filters:[{name:"Vídeos, imagens e áudio",extensions:Object.values(MEDIA_FILE_EXTENSIONS).flat()}]});
    return typeof path==="string"?path:null;
  },undefined,{kind:"library"}),[run]);
  const importPath=useCallback((path:string,intent:CompositionImportIntent)=>run(async()=>path,undefined,intent),[run]);
  return {pick,pickLibrary,importPath,busy,progress,kind,cancel:()=>controller.current?.abort()};
}
