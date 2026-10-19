import { formatPlaybackTime } from "../../lib/playback";
import { SkipBackIcon } from "@phosphor-icons/react/dist/csr/SkipBack";
import { SkipForwardIcon } from "@phosphor-icons/react/dist/csr/SkipForward";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";

interface Props {time:number;start:number;end:number;duration:number;playing:boolean;enabled:boolean;onSeek:(time:number)=>void;onToggle:()=>void}
export function PlaybackControls({time,start,end,duration,playing,enabled,onSeek,onToggle}:Props) {
  return <div className="playback-controls" role="group" aria-label="Reprodução do vídeo">
    <button type="button" disabled={!enabled} aria-label="Ir para o início" title="Ir para o início" onClick={()=>onSeek(start)}>
      <SkipBackIcon size={18} aria-hidden="true"/></button>
    <button type="button" disabled={!enabled} aria-label={playing?"Pausar":"Reproduzir"} aria-keyshortcuts="Space" title={playing?"Pausar (Espaço)":"Reproduzir (Espaço)"} onClick={onToggle}>
      {playing ? <PauseIcon size={18} weight="fill" aria-hidden="true"/> : <PlayIcon size={18} weight="fill" aria-hidden="true"/>}</button>
    <button type="button" disabled={!enabled} aria-label="Ir para o fim" title="Ir para o fim" onClick={()=>onSeek(end)}>
      <SkipForwardIcon size={18} aria-hidden="true"/></button>
    <output aria-label="Tempo de reprodução">{formatPlaybackTime(time)} <span>/ {formatPlaybackTime(duration)}</span></output>
  </div>;
}
