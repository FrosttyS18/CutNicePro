import { clampTime } from "../../lib/workspace";
import type { EditorSettings } from "../../lib/workspace-types";
import { useState } from "react";
import { useVideoFrames } from "../../hooks/useVideoFrames";
import { useTimelinePreview } from "../../hooks/useTimelinePreview";
import { TimelineSurface } from "./TimelineSurface";
import { PlaybackControls } from "./PlaybackControls";
import { playbackBounds } from "../../lib/playback";

interface Props {
  localUrl: string | null;
  mediaId?: string;
  duration: number | null;
  time: number;
  playing: boolean;
  canPlay: boolean;
  settings: EditorSettings;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSettings: (settings: Partial<EditorSettings>) => void;
}

export function EditorTimeline({ localUrl, mediaId, duration, time, playing, canPlay, settings, onSeek, onTogglePlay, onSettings }: Props) {
  const length = duration ?? 0;
  const [zoom, setZoom] = useState(1);
  const legacyFrames = useVideoFrames(mediaId?null:localUrl, duration);
  const preview = useTimelinePreview(mediaId);
  const [start,end]=playbackBounds(length,settings.trimStart,settings.trimEnd);
  return (
    <section className="editor-timeline" aria-label="Linha do tempo">
      <header><h2>Linha do tempo</h2>
        <PlaybackControls time={time} duration={length} start={start} end={end} playing={playing} enabled={canPlay&&length>0} onSeek={onSeek} onToggle={onTogglePlay}/>
        <label className="timeline-zoom">
          <button type="button" className="timeline-zoom-btn" aria-label="Diminuir zoom" title="Diminuir zoom"
            onClick={() => setZoom(z => Math.max(1, Math.round((z - 0.5) * 2) / 2))}>−</button>
          <span className="sr-only">Zoom</span>
          <input type="range" min={1} max={4} step={.5} value={zoom}
            aria-label="Zoom da linha do tempo" onChange={(event) => setZoom(Number(event.target.value))} />
          <button type="button" className="timeline-zoom-btn" aria-label="Aumentar zoom" title="Aumentar zoom"
            onClick={() => setZoom(z => Math.min(4, Math.round((z + 0.5) * 2) / 2))}>+</button>
        </label>
      </header>
      <div className="timeline-scroll"><div className="timeline-content" style={{ width: `${zoom * 100}%` }}>
      <TimelineSurface duration={length} time={clampTime(time,length)} canPlay={canPlay} settings={settings} onSeek={onSeek}
        frames={mediaId?preview.frames:legacyFrames} peaks={preview.peaks} loading={preview.loading} hasAudio={preview.hasAudio}/>
      </div></div>
      {preview.error && <p className="timeline-error" role="alert">{preview.error}</p>}
      <fieldset className="timeline-trim" disabled={!length || !canPlay} id="editor-trim"><legend>Corte do vídeo</legend>
        <label>Início (s)<input type="number" min={0} max={Math.max(0, (settings.trimEnd ?? length) - 0.01)} step={0.01}
          value={settings.trimStart} onChange={(event) => onSettings({ trimStart: Math.max(0, Math.min(Number(event.target.value), (settings.trimEnd ?? length) - 0.01)) })} /></label>
        <label>Fim (s)<input type="number" min={settings.trimStart + 0.01} max={length} step={0.01}
          value={settings.trimEnd ?? length} onChange={(event) => onSettings({ trimEnd: Math.min(length, Math.max(Number(event.target.value), settings.trimStart + 0.01)) })} /></label>
        <p>O vídeo original será mantido.</p>
      </fieldset>
    </section>
  );
}
