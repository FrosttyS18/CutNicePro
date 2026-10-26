import { clampTime } from "../../lib/workspace";
import type { EditSegment, EditorSettings } from "../../lib/workspace-types";
import { useMemo, useState } from "react";
import { useVideoFrames } from "../../hooks/useVideoFrames";
import { useTimelinePreview } from "../../hooks/useTimelinePreview";
import { TimelineSurface } from "./TimelineSurface";
import { PlaybackControls } from "./PlaybackControls";
import { playbackBounds } from "../../lib/playback";
import { effectiveSegments, splitAt, trimLimits, trimSegment, segmentIndexAt, type TrimEdge } from "../../lib/edit-plan";
import "./timeline-trim.css";
import { ScissorsIcon } from "@phosphor-icons/react/dist/csr/Scissors";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";

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
  onTrimSettings?: (settings: Partial<EditorSettings>) => void;
  planEnabled?: boolean;
}

export function EditorTimeline({ localUrl, mediaId, duration, time, playing, canPlay, settings, onSeek, onTogglePlay, onSettings, onTrimSettings }: Props) {
  const length = duration ?? 0;
  const [zoom, setZoom] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const legacyFrames = useVideoFrames(mediaId?null:localUrl, duration);
  const preview = useTimelinePreview(mediaId);
  const segments = useMemo(() => effectiveSegments(settings, length), [settings, length]);
  const selected = Math.min(selectedIndex, segments.length - 1);
  const selectedSegment = segments[selected];
  const [start,end] = segments.length
    ? [segments[0].sourceStart, segments[segments.length-1].sourceEnd]
    : playbackBounds(length,settings.trimStart,settings.trimEnd);
  const commitSettings = onTrimSettings ?? onSettings;
  const setPlan = (next: EditSegment[] | null) => {
    if (next?.length && next !== segments) commitSettings({ editPlan: next.length > 1 ? { version: 1, segments: next } : null,
      trimStart: next[0].sourceStart, trimEnd: next[next.length - 1].sourceEnd });
  };
  const commitTrim = (index: number, edge: TrimEdge, value: number) => {
    const next = trimSegment(segments, index, edge, value, length);
    if (!next || next === segments) return;
    setPlan(next);
  };
  const startLimits = trimLimits(segments, selected, "start", length);
  const endLimits = trimLimits(segments, selected, "end", length);
  return (
    <section className="editor-timeline" aria-label="Linha do tempo">
      <header><div className="timeline-heading"><h2>Linha do tempo</h2>
        <div className="timeline-edit-actions" role="group" aria-label="Editar seleção">
          <button type="button" className="editor-icon-button" aria-label="Dividir no cursor" title="Dividir no cursor"
            disabled={!canPlay || splitAt(segments, time) === null}
            onClick={() => { const next = splitAt(segments, time); if (next) { setPlan(next); setSelectedIndex(segmentIndexAt(next, time)); } }}><ScissorsIcon size={17}/><span className="sr-only">Dividir</span></button>
          <button type="button" className="editor-icon-button" aria-label="Excluir trecho selecionado" title="Excluir trecho selecionado"
            disabled={!canPlay || segments.length <= 1 || !selectedSegment}
            onClick={() => { setPlan(segments.filter((_, index) => index !== selected)); setSelectedIndex(Math.max(0, selected - 1)); }}><TrashIcon size={17}/><span className="sr-only">Excluir trecho selecionado</span></button>
        </div></div>
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
        segments={segments} selectedSegment={selected} onSelectSegment={setSelectedIndex} onTrimCommit={commitTrim}
        frames={mediaId?preview.frames:legacyFrames} peaks={preview.peaks} loading={preview.loading} hasAudio={preview.hasAudio}/>
      </div></div>
      {preview.error && <p className="timeline-error" role="alert">{preview.error}</p>}
      <details className="timeline-precision" id="editor-trim">
        <summary><SlidersHorizontalIcon size={15} aria-hidden="true"/>Ajuste preciso</summary>
        <fieldset className="timeline-trim" disabled={!length || !canPlay}><legend>Intervalo selecionado</legend>
        <label>Início (s)<input type="number" aria-label="Início do trecho selecionado em segundos" min={startLimits?.min ?? 0} max={startLimits?.max ?? length} step={0.01}
          value={selectedSegment?.sourceStart ?? 0} disabled={!startLimits}
          onChange={event => { if (event.target.value !== "") commitTrim(selected, "start", event.target.valueAsNumber); }} /></label>
        <label>Fim (s)<input type="number" aria-label="Fim do trecho selecionado em segundos" min={endLimits?.min ?? 0} max={endLimits?.max ?? length} step={0.01}
          value={selectedSegment?.sourceEnd ?? length} disabled={!endLimits}
          onChange={event => { if (event.target.value !== "") commitTrim(selected, "end", event.target.valueAsNumber); }} /></label>
        </fieldset>
      </details>
    </section>
  );
}
