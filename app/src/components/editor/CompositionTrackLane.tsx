import { memo, useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { frameToSeconds } from "../../lib/composition-time";
import type { CompositionAsset, CompositionItem, CompositionTrack, FrameRate } from "../../lib/composition-types";

export interface TimelinePreviewData { frames: string[]; peaks: number[] }
interface Props {
  track: CompositionTrack; items: CompositionItem[]; assets: CompositionAsset[]; fps: FrameRate;
  width: number; scale: number; startPixel: number; visibleWidth: number; selected: Set<string>;
  previews?: Record<string, TimelinePreviewData>;
  sourceAudio?: ReadonlySet<string>;
  sourceCaptions?: ReadonlySet<string>;
  onBegin: (event: PointerEvent<HTMLElement>, item: CompositionItem, edge?: "start" | "end") => void;
  onEdgeKey: (event: KeyboardEvent<HTMLElement>, item: CompositionItem, edge: "start" | "end") => void;
  onSelect: (ids: string[]) => void;
  onContext?: (event: React.MouseEvent, item: CompositionItem) => void;
  onTrackContext?: (event:React.MouseEvent,id:string)=>void;
}
function Waveform({ item, asset, peaks, width }: { item: CompositionItem; asset: CompositionAsset; peaks: number[]; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!peaks.length || !asset.durationUs) return;
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    element.width = Math.max(1, Math.min(1600, Math.round(width))); element.height = 28;
    context.clearRect(0,0,element.width,28); context.fillStyle = "#8c9a9c";
    for (let x=0;x<element.width;x++) {
      const time = item.sourceStartUs + x / element.width * (item.sourceEndUs-item.sourceStartUs);
      const amplitude = Math.min(1, Math.abs(peaks[Math.min(peaks.length-1,Math.floor(time/asset.durationUs*peaks.length))] ?? 0));
      context.fillRect(x,14-amplitude*12,1,Math.max(1,amplitude*24));
    }
  }, [item.sourceStartUs,item.sourceEndUs,asset.durationUs,peaks,width]);
  return <canvas ref={canvas} className="composition-item__wave" aria-hidden="true"/>;
}

export const CompositionTrackLane = memo(function CompositionTrackLane({ track, items, assets, fps, width, scale, startPixel, visibleWidth, selected, previews = {}, sourceAudio, sourceCaptions, onBegin, onEdgeKey, onSelect, onContext,onTrackContext }: Props) {
  return <div className="composition-track" role="group" aria-label={`Faixa ${track.name}`} data-kind={track.kind} data-track-kind={track.kind} data-composition-track={track.id} data-locked={track.locked}>
    <div className="composition-track__label"><span>{track.id.length < 8 ? track.id : track.kind === "audio" ? "A" : "V"}</span><strong>{track.name}</strong><button type="button" className="composition-track__menu" aria-label={`Opções da faixa ${track.name}`} onClick={event=>onTrackContext?.(event,track.id)}><DotsThreeIcon size={16}/></button>{track.locked && <small>Bloqueada</small>}{track.muted&&<small>Silenciada</small>}{track.hidden&&<small>Oculta</small>}</div>
    <div className="composition-track__items" style={{ width }}>
      {items.filter(item => item.startFrame*scale + item.durationFrames*scale > startPixel - 120 && item.startFrame*scale < startPixel + visibleWidth + 120).map(item => {
        const asset = assets.find(value => value.id === item.assetId)!;
        const itemWidth = item.durationFrames * scale;
        const preview = previews[item.assetId];
        const first = Math.max(0,Math.floor((startPixel-item.startFrame*scale)/80));
        const last = Math.min(Math.ceil(itemWidth/80),Math.ceil((startPixel+visibleWidth-item.startFrame*scale)/80));
        const frameImages = [];
        if (preview?.frames.length) for (let index=first;index<last;index++) {
          const source = item.sourceStartUs/1e6 + frameToSeconds(index*80/scale,fps);
          const frameIndex = Math.max(0,Math.min(preview.frames.length-1,Math.round(source/(asset.durationUs/1e6)*(preview.frames.length-1))));
          frameImages.push(<img key={index} src={preview.frames[frameIndex]} alt="" loading="lazy" decoding="async" style={{left:index*80,width:80}}/>);
        }
        const selectedItem = selected.has(item.id);
        const name = item.kind === "audio" ? `áudio de ${asset.name}` : item.kind === "caption" ? `legenda de ${asset.name}` : asset.name;
        return <div key={item.id} className="composition-item" data-composition-item={item.id} data-start-frame={item.startFrame} data-source-start-us={item.sourceStartUs} data-source-end-us={item.sourceEndUs}
          data-selected={selectedItem} data-kind={item.kind} data-source-audio={sourceAudio?.has(item.id)||undefined} role="group" tabIndex={0} aria-label={`${selectedItem ? "Selecionado: " : ""}${name}`}
          style={{left:24+item.startFrame*scale,width:Math.max(3,itemWidth)}} onPointerDown={event=>onBegin(event,item)}
          onContextMenu={event=>{event.preventDefault();onContext?.(event,item);}}
          onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();onSelect([item.id]);}}}>
          <div className="composition-item__frames" aria-hidden="true">{item.kind === "video" || item.kind === "image" ? frameImages : null}</div>
          {(item.kind === "audio"||sourceAudio?.has(item.id)) && <Waveform item={item} asset={asset} peaks={preview?.peaks ?? []} width={itemWidth}/>}
          <span className="composition-item__name">{item.kind === "caption" ? "Legendas" : asset.name}</span>
          {sourceCaptions?.has(item.id)&&<span className="composition-item__caption-badge" aria-label="Legendas vinculadas">CC</span>}
          {(["start","end"] as const).map(edge=><button key={edge} type="button" className={`composition-item__handle composition-item__handle--${edge}`}
            aria-label={`Ajustar ${edge === "start" ? "início" : "fim"} de ${name}`} aria-disabled={track.locked}
            onPointerDown={event=>onBegin(event,item,edge)} onKeyDown={event=>onEdgeKey(event,item,edge)}><span aria-hidden="true"/></button>)}
        </div>;
      })}
    </div>
  </div>;
});
