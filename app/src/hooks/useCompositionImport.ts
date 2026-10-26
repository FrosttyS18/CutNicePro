import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { importMedia } from "../lib/ipc";
import type { CompositionAsset, MediaKind } from "../lib/composition-types";

const extensions:Record<MediaKind,string[]>={video:["mp4","m4v","mov","webm","mkv","avi"],image:["png","jpg","jpeg","webp"],audio:["wav","mp3","m4a","aac","ogg","opus","flac"]};
export function useCompositionImport(projectId:string,onComplete:(asset:CompositionAsset,overlay:boolean)=>void,onError:(message:string)=>void){
  const callbacks=useRef({onComplete,onError});
  useLayoutEffect(()=>{callbacks.current={onComplete,onError};},[onComplete,onError]);
  const controller=useRef<AbortController|null>(null);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState<{copied:number;total:number}|null>(null);
  const [kind,setKind]=useState<MediaKind>("video");
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;},[projectId]);
  const pick=useCallback(async(kind:MediaKind,overlay=false)=>{
    if(controller.current)return;
    const operation=new AbortController();controller.current=operation;
    try {
      const path=await open({multiple:false,directory:false,filters:[{name:kind==="image"?"Imagens":kind==="audio"?"Áudio":"Vídeos",extensions:extensions[kind]}]});
      if(typeof path!=="string"||operation.signal.aborted)return;
      setKind(kind);setBusy(true);setProgress(null);
      const result=await importMedia(projectId,path,(copied,total)=>{if(controller.current===operation)setProgress({copied,total});},operation.signal,kind);
      if(operation.signal.aborted)return;
      const {entry,analysisError}=result;const analysis=entry.analysis;
      if(analysisError||!analysis)throw new Error(analysisError??"Não foi possível analisar esta mídia");
      if(kind==="audio" ? !analysis.hasAudio||analysis.durationMs<=0 : analysis.width<=0||analysis.height<=0||kind==="video"&&analysis.durationMs<=0)throw new Error("O arquivo não corresponde ao tipo de mídia escolhido");
      callbacks.current.onComplete({id:entry.mediaId,mediaId:entry.mediaId,name:entry.originalName,kind,durationUs:analysis.durationMs*1000,width:analysis.width,height:analysis.height,transcript:[],hasAudio:analysis.hasAudio},overlay);
    } catch(error){if(!operation.signal.aborted)callbacks.current.onError(error instanceof Error?error.message:typeof error==="string"?error:"Não foi possível importar esta mídia");}
    finally {if(controller.current===operation){controller.current=null;setBusy(false);setProgress(null);}}
  },[projectId]);
  return {pick,busy,progress,kind,cancel:()=>controller.current?.abort()};
}
