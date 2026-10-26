import { useEffect, useMemo, useRef, useState } from "react";
import * as ipc from "../lib/ipc";
import type { CompositionAsset } from "../lib/composition-types";
import { subscribeMediaRelinked } from "../services/media-relink-events";
import { unavailableMediaMessage } from "../lib/media-availability";

interface Entry { url:string|null; error:string|null; entry?:ipc.MediaEntryDto|null }
type Resolution = { url: string | null; entry: ipc.MediaEntryDto | null } | { failure: unknown };
interface SourceRequest { mediaId: string; revision: number; token: symbol; result?: Resolution }

export function useCompositionMedia(assets:CompositionAsset[],sourceId?:string,sourceUrl?:string|null) {
  const [relinked,setRelinked]=useState<Record<string,number>>({});
  const targets=useMemo(()=>assets.map(asset=>{
    const revision=relinked[asset.mediaId]??0;
    return {asset,revision,key:JSON.stringify([asset.mediaId,revision]),url:!revision&&asset.mediaId===sourceId&&sourceUrl?sourceUrl:null};
  }),[assets,sourceId,sourceUrl,relinked]);
  const needed=useMemo(()=>new Map(targets.filter(target=>!target.url).map(target=>[target.key,{mediaId:target.asset.mediaId,revision:target.revision}])),[targets]);
  const [sources,setSources]=useState<Record<string,SourceRequest>>({});
  if(needed.size!==Object.keys(sources).length||[...needed.keys()].some(key=>!sources[key])){
    setSources(Object.fromEntries([...needed].map(([key,source])=>[key,sources[key]??{...source,token:Symbol()}])));
  }
  const active=useRef(false);
  const started=useRef(new Set<symbol>());
  useEffect(()=>{
    const requests=started.current;
    active.current=true;
    return()=>{
      active.current=false;
      queueMicrotask(()=>{if(!active.current)requests.clear();});
    };
  },[]);
  useEffect(()=>subscribeMediaRelinked(mediaId=>{
    if(assets.some(asset=>asset.mediaId===mediaId))setRelinked(current=>({...current,[mediaId]:(current[mediaId]??0)+1}));
  }),[assets]);
  useEffect(()=>{
    const tokens=new Set(Object.values(sources).map(source=>source.token));
    for(const token of started.current)if(!tokens.has(token))started.current.delete(token);
    for(const [key,source] of Object.entries(sources)){
      if(source.result||started.current.has(source.token))continue;
      started.current.add(source.token);
      void (async()=>{
        let result:Resolution;
        try{
          const entry=await ipc.getMedia(source.mediaId);
          const url=entry&&!entry.unavailable?ipc.mediaUrl(entry):null;
          result={entry,url:url&&source.revision?`${url}?relink=${source.revision}`:url};
        }catch(failure){result={failure};}
        if(!active.current)return;
        setSources(current=>current[key]?.token===source.token?{...current,[key]:{...source,result}}:current);
      })();
    }
  },[sources]);
  return useMemo(()=>{
    const entries:Record<string,Entry>={};
    for(const {asset,key,url} of targets){
      if(url){entries[asset.id]={url,error:null};continue;}
      const result=sources[key]?.result;
      if(!result)continue;
      if("failure" in result){entries[asset.id]={url:null,error:result.failure instanceof Error?result.failure.message:`Não foi possível abrir ${asset.name}`,entry:null};continue;}
      const {entry}=result;
      entries[asset.id]=!entry||entry.unavailable?{url:null,error:unavailableMediaMessage(entry,asset.name),entry}:{url:result.url,error:null,entry};
    }
    return entries;
  },[targets,sources]);
}
