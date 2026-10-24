import { clampTime } from "../../lib/workspace";
import type { EditSegment, EditorSettings } from "../../lib/workspace-types";
import { useState } from "react";
import { useVideoFrames } from "../../hooks/useVideoFrames";
import { useTimelinePreview } from "../../hooks/useTimelinePreview";
import { TimelineSurface } from "./TimelineSurface";
import { PlaybackControls } from "./PlaybackControls";
import { playbackBounds } from "../../lib/playback";
import { effectiveSegments, planIsValid, splitAt, removeAt, normalizePlan } from "../../lib/edit-plan";

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
  /** Modo corte (activeClip): controles de plano habilitados; o primeiro
   *  "Dividir" cria o plano a partir do intervalo efetivo (trim). */
  planEnabled?: boolean;
}

export function EditorTimeline({ localUrl, mediaId, duration, time, playing, canPlay, settings, onSeek, onTogglePlay, onSettings, planEnabled = false }: Props) {
  const length = duration ?? 0;
  const [zoom, setZoom] = useState(1);
  const legacyFrames = useVideoFrames(mediaId?null:localUrl, duration);
  const preview = useTimelinePreview(mediaId);
  // Plano de edição (M2): em modo corte, a composição é o intervalo efetivo
  // (plano salvo ou trim único); sem plano, o primeiro "Dividir" o cria.
  const savedPlan = settings.editPlan ? normalizePlan(settings.editPlan) : null;
  const planValid = Boolean(savedPlan && length && planIsValid(savedPlan, length));
  const segments = planEnabled && length
    ? (planValid ? savedPlan : effectiveSegments(settings, length))
    : null;
  const [start,end] = segments?.length
    ? [segments[0].sourceStart, segments[segments.length-1].sourceEnd]
    : playbackBounds(length,settings.trimStart,settings.trimEnd);
  const setPlan = (next: EditSegment[] | null) => { if (next) onSettings({ editPlan: { version: 1, segments: next } }); };
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
        segments={segments}
        frames={mediaId?preview.frames:legacyFrames} peaks={preview.peaks} loading={preview.loading} hasAudio={preview.hasAudio}/>
      </div></div>
      {preview.error && <p className="timeline-error" role="alert">{preview.error}</p>}
      <fieldset className="timeline-trim" disabled={!length || !canPlay} id="editor-trim"><legend>Corte do vídeo</legend>
        <label>Início (s)<input type="number" min={0} max={Math.max(0, (settings.trimEnd ?? length) - 0.01)} step={0.01}
          value={segments ? segments[0].sourceStart : settings.trimStart}
          onChange={(event) => {
            const value = Math.max(0, Math.min(Number(event.target.value), (segments ? segments[segments.length-1].sourceEnd : (settings.trimEnd ?? length)) - 0.01));
            if (segments) setPlan(segments.map((s,i) => i === 0 ? { ...s, sourceStart: value } : s));
            else onSettings({ trimStart: value });
          }} /></label>
        <label>Fim (s)<input type="number" min={settings.trimStart + 0.01} max={length} step={0.01}
          value={segments ? segments[segments.length-1].sourceEnd : settings.trimEnd ?? length}
          onChange={(event) => {
            const value = Math.min(length, Math.max(Number(event.target.value), (segments ? segments[0].sourceStart : settings.trimStart) + 0.01));
            if (segments) setPlan(segments.map((s,i) => i === segments.length-1 ? { ...s, sourceEnd: value } : s));
            else onSettings({ trimEnd: value });
          }} /></label>
        {planEnabled && <div className="timeline-plan-actions">
          <button type="button" className="flow-button" disabled={!segments || splitAt(segments ?? [], time) === null}
            onClick={() => segments && setPlan(splitAt(segments, time) ?? segments)}>Dividir no playhead</button>
          <button type="button" className="flow-button" disabled={!segments || removeAt(segments ?? [], time) === null}
            onClick={() => segments && setPlan(removeAt(segments, time) ?? segments)}>Remover trecho do playhead</button>
          {settings.editPlan && <button type="button" className="flow-button" onClick={() => onSettings({ editPlan: null })}>Corte simples</button>}
        </div>}
        <p>O vídeo original será mantido.</p>
      </fieldset>
    </section>
  );
}
