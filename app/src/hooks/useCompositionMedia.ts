import { useEffect, useState } from "react";
import * as ipc from "../lib/ipc";
import type { CompositionAsset } from "../lib/composition-types";

interface Entry { url:string|null; error:string|null }
export function useCompositionMedia(assets:CompositionAsset[],sourceId?:string,sourceUrl?:string|null) {
  const [entries,setEntries]=useState<Record<string,Entry>>({});
  useEffect(()=>{
    let active=true;
    void Promise.all(assets.map(async asset=>{
      if(asset.mediaId===sourceId && sourceUrl)return [asset.id,{url:sourceUrl,error:null}] as const;
      try {
        const media=await ipc.getMedia(asset.mediaId);
        if(!media||media.unavailable)throw new Error(`Mídia indisponível: ${asset.name}. Reconecte o arquivo original no projeto.`);
        return [asset.id,{url:ipc.mediaUrl(media),error:null}] as const;
      } catch(error){return [asset.id,{url:null,error:error instanceof Error ? error.message : `Não foi possível abrir ${asset.name}`}] as const;}
    })).then(values=>{if(active)setEntries(Object.fromEntries(values));});
    return()=>{active=false;};
  },[assets,sourceId,sourceUrl]);
  return entries;
}
