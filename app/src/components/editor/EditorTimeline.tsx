import { clampTime, formatMediaTime } from "../../lib/workspace";
import type { EditorSettings } from "../../lib/workspace-types";
import { useState } from "react";
import { useVideoFrames } from "../../hooks/useVideoFrames";

interface Props {
  localUrl: string | null;
  duration: number | null;
  time: number;
  playing: boolean;
  canPlay: boolean;
  settings: EditorSettings;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSettings: (settings: Partial<EditorSettings>) => void;
}

export function EditorTimeline({ localUrl, duration, time, playing, canPlay, settings, onSeek, onTogglePlay, onSettings }: Props) {
  const length = duration ?? 0;
  const [zoom, setZoom] = useState(1);
  const frames = useVideoFrames(localUrl, duration);
  return (
    <section className="editor-timeline" aria-label="Linha do tempo">
      <header><h2>Linha do tempo</h2>
        <button type="button" className="flow-button" disabled={!canPlay} onClick={onTogglePlay}>{playing ? "Pausar" : "Reproduzir"}</button>
        <output>{formatMediaTime(time)} <span>/ {duration ? formatMediaTime(duration) : "Duração não disponível"}</span></output>
        <label className="timeline-zoom">Zoom<input type="range" min={1} max={4} step={.5} value={zoom}
          aria-label="Zoom da linha do tempo" onChange={(event) => setZoom(Number(event.target.value))} /></label>
      </header>
      <div className="timeline-scroll"><div className="timeline-content" style={{ width: `${zoom * 100}%` }}>
      <div className="timeline-ruler" aria-hidden="true">{Array.from({ length: 11 }, (_, index) => <span key={index}>{formatMediaTime(length * index / 10)}</span>)}</div>
      <div className="timeline-track" aria-hidden="true">
        <div className="timeline-filmstrip">{frames.map((frame, index) => <img key={index} src={frame} alt="" width={160} height={90} draggable={false} />)}</div>
        {!frames.length && <span>{canPlay ? "Vídeo original" : "Mídia indisponível"}</span>}
        <div className="timeline-trim-shade" style={{ width: `${length ? settings.trimStart / length * 100 : 0}%` }} />
        <div className="timeline-trim-shade timeline-trim-shade--end" style={{ width: `${length ? (1 - (settings.trimEnd ?? length) / length) * 100 : 0}%` }} />
        <i style={{ left: `${length ? clampTime(time, length) / length * 100 : 0}%` }} />
      </div>
      <label className="timeline-seek"><span className="upload-sr-only">Posição do vídeo</span>
        <input type="range" min={0} max={length || 1} step={0.01} value={clampTime(time, length)}
          aria-label="Posição do vídeo" disabled={!canPlay || !length} onChange={(event) => onSeek(Number(event.target.value))} />
      </label>
      </div></div>
      <fieldset className="timeline-trim" disabled={!length || !canPlay}><legend>Intervalo da prévia</legend>
        <label>Início (s)<input type="number" min={0} max={Math.max(0, (settings.trimEnd ?? length) - 0.01)} step={0.01}
          value={settings.trimStart} onChange={(event) => onSettings({ trimStart: Math.max(0, Math.min(Number(event.target.value), (settings.trimEnd ?? length) - 0.01)) })} /></label>
        <label>Fim (s)<input type="number" min={settings.trimStart + 0.01} max={length} step={0.01}
          value={settings.trimEnd ?? length} onChange={(event) => onSettings({ trimEnd: Math.min(length, Math.max(Number(event.target.value), settings.trimStart + 0.01)) })} /></label>
        <p>Intervalo de reprodução</p>
      </fieldset>
    </section>
  );
}
