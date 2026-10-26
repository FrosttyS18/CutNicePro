import { useEffect, useRef, useState } from "react";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { readWorkspace } from "../../services/workspace-store";
import { loadClipThumbnail, type ClipThumbnail } from "../../services/clip-thumbnails";

export function ProjectThumbnail({ id }: { id: string }) {
  const root=useRef<HTMLSpanElement>(null);
  const [sample,setSample]=useState<(ClipThumbnail&{key:string})|null>(null);
  const [failed,setFailed]=useState<string|null>(null);
  const media = readWorkspace(id).media;
  const mediaId=media?.kind==="local"?media.mediaId:undefined;
  const time=Math.min(5,Math.max(0,(media?.duration??0)/10));
  const key=`${id}:${mediaId??media?.videoId??""}:${time}`;
  useEffect(()=>{
    if(!mediaId || failed===key)return;
    let disposed=false;
    let requested=false;
    const load=()=>{
      if(requested || disposed)return;
      requested=true;
      void loadClipThumbnail(mediaId,time).then(value=>{if(!disposed)setSample({...value,key});}).catch(()=>{if(!disposed)setFailed(key);});
    };
    const observer=typeof IntersectionObserver==="undefined"?null:new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer?.disconnect();load();}
    },{rootMargin:"180px"});
    if(observer&&root.current)observer.observe(root.current);else load();
    return()=>{disposed=true;observer?.disconnect();};
  },[mediaId,time,key,failed]);
  const frame=sample?.key===key&&failed!==key?sample:null;
  const src=frame?.src??(failed!==key&&media?.kind==="youtube"&&media.videoId?`https://i.ytimg.com/vi/${media.videoId}/hqdefault.jpg`:null);
  return <span ref={root} className="project-thumbnail" aria-hidden="true">
    {src ? <img src={src} alt="" width={frame?.width} height={frame?.height} loading="lazy" decoding="async" onError={()=>setFailed(key)}/>
      : <span className="project-thumbnail__fallback"><FilmStripIcon size={28} aria-hidden="true"/></span>}
  </span>;
}
