import { useEffect, useMemo } from "react";
import { useTimelinePreview } from "../../hooks/useTimelinePreview";
import type { CompositionAsset } from "../../lib/composition-types";
import type { TimelinePreviewData } from "./CompositionTrackLane";

const emptyPreview:TimelinePreviewData={frames:[],peaks:[]};
interface Props {
  asset:CompositionAsset;
  imageUrl?:string|null;
  onData:(id:string,data:TimelinePreviewData)=>void;
}

function ImagePreview({asset,imageUrl,onData}:Props){
  const preview=useMemo<TimelinePreviewData>(()=>imageUrl?{frames:[imageUrl],peaks:[]}:emptyPreview,[imageUrl]);
  useEffect(()=>onData(asset.id,preview),[asset.id,preview,onData]);
  return null;
}

function TimedPreview({asset,onData}:Props){
  const preview=useTimelinePreview(asset.mediaId);
  const data=useMemo<TimelinePreviewData>(()=>preview.frames.length||preview.peaks.length
    ?{frames:preview.frames,peaks:preview.peaks}:emptyPreview,[preview.frames,preview.peaks]);
  useEffect(()=>onData(asset.id,data),[asset.id,data,onData]);
  return preview.error?<p className="flow-muted" role="status">{asset.name}: {preview.error}</p>:null;
}

export function CompositionPreviewLoader(props:Props){
  return props.asset.kind==="image"?<ImagePreview {...props}/>:<TimedPreview {...props}/>;
}
