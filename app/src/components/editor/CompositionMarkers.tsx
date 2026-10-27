import { useRef } from "react";
import { BookmarkSimpleIcon } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { useEditorTooltip } from "../../hooks/useEditorTooltip";
import { formatCompositionTimecode } from "../../lib/composition-timecode";
import type { CompositionMarker,FrameRate } from "../../lib/composition-types";
import "./composition-markers.css";

interface Props {marker:CompositionMarker;fps:FrameRate;left:number;onSeek:(frame:number)=>void;onEdit:(id:string,point:{x:number;y:number})=>void}
function Marker({marker,fps,left,onSeek,onEdit}:Props){
  const ref=useRef<HTMLButtonElement>(null);
  const label=`${marker.name} · ${formatCompositionTimecode(marker.frame,fps)}`;
  const tooltip=useEditorTooltip(ref,label);
  const edit=()=>{const bounds=ref.current?.getBoundingClientRect();tooltip.hide();onEdit(marker.id,{x:bounds?.left??16,y:(bounds?.top??240)-220});};
  return <><button ref={ref} type="button" className="composition-marker" data-composition-marker={marker.id} aria-label={`Marcador: ${label}`} aria-describedby={tooltip.descriptionId}
    style={{left,color:marker.color}} {...tooltip.trigger} onPointerDown={event=>event.stopPropagation()} onClick={()=>onSeek(marker.frame)} onDoubleClick={edit}
    onKeyDown={event=>{tooltip.trigger.onKeyDown(event);if(event.key==="Enter"){event.preventDefault();event.stopPropagation();edit();}}}><BookmarkSimpleIcon size={13} weight="fill" aria-hidden="true"/></button>{tooltip.portal}</>;
}
interface MarkersProps {markers:CompositionMarker[];fps:FrameRate;inset:number;scale:number;scroll:number;width:number;onSeek:(frame:number)=>void;onEdit:(id:string,point:{x:number;y:number})=>void}
export function CompositionMarkers({markers,fps,inset,scale,scroll,width,onSeek,onEdit}:MarkersProps){
  return <div className="composition-markers" role="group" aria-label="Marcadores da montagem">{markers.filter(marker=>marker.frame*scale>=scroll-144&&marker.frame*scale<=scroll+width).map(marker=><Marker key={marker.id} marker={marker} fps={fps} left={inset+marker.frame*scale} onSeek={onSeek} onEdit={onEdit}/>)}</div>;
}
