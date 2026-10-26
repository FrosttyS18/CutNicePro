import { useRef } from "react";
import { trimLimits, type TrimEdge } from "../../lib/edit-plan";
import { formatPlaybackTime } from "../../lib/playback";
import type { EditSegment } from "../../lib/workspace-types";
import type { useTimelineTrim } from "./useTimelineTrim";

interface Props {
  segments: EditSegment[];
  duration: number;
  selected: number;
  onSelect: (index: number) => void;
  trim: ReturnType<typeof useTimelineTrim>;
}

export function TimelineSegments({ segments, duration, selected, onSelect, trim }: Props) {
  const lane = useRef<HTMLDivElement>(null);
  return <div className="timeline-segments" ref={lane} role="group" aria-label="Trechos do vídeo">
    {segments.map((segment, index) => <div className="timeline-segment" key={index} data-selected={selected === index}
      style={{ left: `${segment.sourceStart / duration * 100}%`, width: `${(segment.sourceEnd - segment.sourceStart) / duration * 100}%` }}>
      <button type="button" className="timeline-segment__select" aria-label={`Selecionar trecho ${index + 1}`}
        aria-pressed={selected === index} title={`Trecho ${index + 1}: ${formatPlaybackTime(segment.sourceStart)} a ${formatPlaybackTime(segment.sourceEnd)}`}
        onPointerDown={event => event.stopPropagation()} onClick={() => onSelect(index)}><span className="sr-only">Selecionar trecho {index + 1}</span></button>
      {(["start", "end"] as TrimEdge[]).map(edge => {
        const limits = trimLimits(segments, index, edge, duration);
        if (!limits) return null;
        const value = segment[edge === "start" ? "sourceStart" : "sourceEnd"];
        const label = `${edge === "start" ? "Início" : "Fim"} do trecho ${index + 1}`;
        return <button type="button" role="slider" key={edge} className={`timeline-trim-handle timeline-trim-handle--${edge}`}
          aria-label={label} aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={value}
          aria-valuetext={`${formatPlaybackTime(value)}; setas ajustam centésimos; Shift ajusta um segundo`}
          aria-orientation="horizontal" title={`${label}: ${formatPlaybackTime(value)}. Arraste para ajustar.`}
          onPointerDown={event => trim.begin(index, edge, event, lane.current)} onPointerMove={trim.move} onPointerUp={trim.finish}
          onPointerCancel={trim.cancelPointer} onLostPointerCapture={trim.cancelPointer} onKeyDown={event => trim.keyboard(index, edge, event)}
          onClick={event => event.stopPropagation()}><span aria-hidden="true"/></button>;
      })}
    </div>)}
  </div>;
}
