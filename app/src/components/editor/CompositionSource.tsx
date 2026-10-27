import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { MusicNoteIcon } from "@phosphor-icons/react/dist/csr/MusicNote";
import { EditorAction } from "./EditorAction";
import { CompositionSourceRange } from "./CompositionSourceRange";
import { formatMediaTime } from "../../lib/workspace";
import { frameToSeconds, secondsToFrame } from "../../lib/composition-time";
import type { CompositionAsset, FrameRate } from "../../lib/composition-types";
import type { CompositionInsertionTarget } from "../../lib/composition-insertion-target";
import "./composition-source.css";

interface Props { asset: CompositionAsset; url: string | null; frames?: string[]; fps?: FrameRate; onInsert: (start: number, end: number) => void; onActivate: () => void; insertLabel?: string; target?:CompositionInsertionTarget }
export function CompositionSource({ asset, url, frames, fps = { numerator: 30, denominator: 1 }, onInsert, onActivate, insertLabel = "Adicionar em nova camada",target="cursor" }: Props) {
  const ref = useRef<HTMLMediaElement>(null);
  const hintId = useId();
  const duration = asset.durationUs / 1e6;
  const timed = asset.kind !== "image";
  const destination=target==="start"?"no início da montagem":target==="end"?"no fim da montagem":"no cursor da montagem";
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(duration);
  const [error, setError] = useState<{ url: string | null; message: string } | null>(null);
  const message = error?.url === url ? error.message : null;
  const available = Boolean(url) && !message;
  const canInsert = available && (!timed || duration > 0 && end > start);
  const step = Math.min(duration, frameToSeconds(1, fps));
  const fail = (value: string) => setError({ url, message: value });
  const seek = (next: number) => { const value = Math.max(0, Math.min(duration, next)); if (ref.current) ref.current.currentTime = value; setTime(value); };
  const range = (first: number, last: number) => { setStart(first); setEnd(last); };
  const markStart = () => { const value = Math.max(0, Math.min(frameToSeconds(secondsToFrame(time, fps), fps), duration - step)); setStart(value); setEnd(previous => Math.max(previous, Math.min(duration, value + step))); };
  const markEnd = () => { const value = Math.min(duration, Math.max(step, frameToSeconds(secondsToFrame(time, fps), fps))); setEnd(value); setStart(previous => Math.min(previous, Math.max(0, value - step))); };
  const toggle = () => {
    if (!available || !timed) return;
    if (ref.current?.paused) void ref.current.play().catch(error=>{
      if(error instanceof Error&&error.name==="AbortError")return;
      fail("Não foi possível reproduzir a fonte. Reabra a mídia para tentar novamente.");
    });
    else ref.current?.pause();
  };
  const insert = () => { if (canInsert) { ref.current?.pause(); onInsert(start, end); } };
  const attach = (element: HTMLMediaElement | null) => { ref.current = element; };
  const mediaEvents = {
    onTimeUpdate: (event: SyntheticEvent<HTMLMediaElement>) => setTime(event.currentTarget.currentTime),
    onPlay: () => setPlaying(true), onPause: () => setPlaying(false),
    onError: () => fail("Não foi possível abrir esta fonte. Reconecte a mídia no projeto."),
  };
  useEffect(() => {
    const element = ref.current;
    if (element && url && element.getAttribute("src") !== url) { element.setAttribute("src", url); element.load(); }
    return () => { element?.pause(); element?.removeAttribute("src"); element?.load(); };
  }, [url]);

  return <section className="composition-source" aria-label={"Fonte: " + asset.name} aria-describedby={hintId} data-editor-viewer="source" tabIndex={0} onFocus={onActivate}
    onKeyDown={event => {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === "Enter") {
        if (event.repeat || event.shiftKey || target.closest('button,[role="button"],a[href]')) return;
        event.preventDefault(); insert();
      } else if (!timed || !available) return;
      else if (event.key.toLowerCase() === "i") { event.preventDefault(); markStart(); }
      else if (event.key.toLowerCase() === "o") { event.preventDefault(); markEnd(); }
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); seek(time + (event.key === "ArrowLeft" ? -1 : 1) * step * (event.shiftKey ? 10 : 1)); }
      else if (event.key === "Home" || event.key === "End") { event.preventDefault(); seek(event.key === "Home" ? 0 : duration); }
      else if (event.key === " " && !target.closest('button,[role="button"],a[href]')) { event.preventDefault(); if (!event.repeat) toggle(); }
    }}>
    <h2>Fonte <span>{asset.name}</span></h2>
    {url && asset.kind === "image" ? <img className="composition-source__preview" src={url} alt={asset.name} onError={mediaEvents.onError}/>
      : url && asset.kind === "audio" ? <div className="composition-source__preview composition-source__audio"><MusicNoteIcon size={40} aria-hidden="true"/><span>Fonte de áudio</span><audio ref={attach} src={url} preload="metadata" {...mediaEvents}/></div>
        : url ? <video className="composition-source__preview" ref={attach} src={url} crossOrigin="anonymous" preload="metadata" playsInline {...mediaEvents}/>
          : <div className="composition-source__preview composition-source__unavailable"><p>Reconecte esta mídia no projeto.</p></div>}
    {timed && duration > 0 && <CompositionSourceRange duration={duration} fps={fps} time={time} start={start} end={end} frames={frames}
      kind={asset.kind === "audio" ? "audio" : "video"} disabled={!available} onSeek={seek} onRange={range} onActivate={() => ref.current?.pause()}/>}
    <div className="composition-source__controls" role="group" aria-label="Controles da fonte">
      {timed && <><EditorAction compact label={playing ? "Pausar fonte" : "Reproduzir fonte"} icon={playing ? <PauseIcon size={16}/> : <PlayIcon size={16}/>} disabled={!available} onClick={toggle}/>
        <output className="composition-source__time" aria-label="Tempo da fonte">{formatMediaTime(time)} / {formatMediaTime(duration)}</output>
        <div className="composition-source__marks"><button type="button" className="flow-button" aria-label="Marcar início (I)" disabled={!available} onClick={markStart}><span>Início</span><output>{formatMediaTime(start)}</output></button>
          <button type="button" className="flow-button" aria-label="Marcar fim (O)" disabled={!available} onClick={markEnd}><span>Fim</span><output>{formatMediaTime(end)}</output></button></div></>}
      <EditorAction label={insertLabel} tooltip={insertLabel + (insertLabel==="Adicionar em nova camada"?" (Enter)":" em nova camada (Enter)")} icon={<PlusIcon size={16}/>} disabled={!canInsert} onClick={insert}/>
    </div>
    {message && <p role="alert" className="upload-message--error">{message}</p>}
    <p id={hintId} className="flow-muted">{timed ? `Arraste nas miniaturas para marcar um trecho. Ctrl + rolagem ajusta o zoom. Enter adiciona uma nova camada ${destination}.` : `Enter adiciona a imagem em uma nova camada ${destination}.`}</p>
  </section>;
}
