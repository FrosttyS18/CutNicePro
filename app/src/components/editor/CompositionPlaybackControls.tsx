import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { SkipBackIcon } from "@phosphor-icons/react/dist/csr/SkipBack";
import { SkipForwardIcon } from "@phosphor-icons/react/dist/csr/SkipForward";
import { EditorAction } from "./EditorAction";
import { frameToSeconds } from "../../lib/composition-time";
import { formatMediaTime } from "../../lib/workspace";
import type { FrameRate } from "../../lib/composition-types";

interface Props {
  frame: number;
  duration: number;
  fps: FrameRate;
  playing: boolean;
  buffering?: boolean;
  onToggle: () => void;
  onSeek: (frame: number) => void;
}

export function CompositionPlaybackControls({ frame, duration, fps, playing, buffering=false, onToggle, onSeek }: Props) {
  return <div className="composition-editor__play" role="group" aria-label="Reprodução da montagem">
    <output aria-label="Tempo da montagem"><span>{formatMediaTime(frameToSeconds(frame, fps))}</span><span> / {formatMediaTime(frameToSeconds(duration, fps))}</span></output>
    <div className="composition-editor__play-actions">
      <EditorAction compact label="Ir ao início da montagem" icon={<SkipBackIcon size={16} aria-hidden="true"/>} disabled={!duration} onClick={()=>onSeek(0)}/>
      <EditorAction compact label={playing?"Pausar montagem":"Reproduzir montagem"} disabled={!duration} icon={playing?<PauseIcon size={20} aria-hidden="true"/>:<PlayIcon size={20} aria-hidden="true"/>} onClick={onToggle}/>
      <EditorAction compact label="Ir ao fim da montagem" icon={<SkipForwardIcon size={16} aria-hidden="true"/>} disabled={!duration} onClick={()=>onSeek(Math.max(0,duration-1))}/>
    </div>
    <span className="composition-editor__play-hint" data-buffering={buffering||undefined} role={buffering?"status":undefined}>{buffering?"Carregando prévia…":`Espaço para ${playing?"pausar":"reproduzir"}`}</span>
  </div>;
}
