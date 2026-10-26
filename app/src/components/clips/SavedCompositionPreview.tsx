import { useState, type CSSProperties } from "react";
import { CompositionStage } from "../editor/CompositionStage";
import { useCompositionMedia } from "../../hooks/useCompositionMedia";
import { useCompositionPlayback } from "../../hooks/useCompositionPlayback";
import { compositionDuration } from "../../lib/composition";
import { frameToSeconds } from "../../lib/composition-time";
import { compositionOutputSize } from "../../lib/composition-placement";
import { PlaybackControls } from "../editor/PlaybackControls";
import type { Composition } from "../../lib/composition-types";
import "../editor/composition-editor.css";

export function SavedCompositionPreview({ document, playback, onReady }: { document: Composition; playback: ReturnType<typeof useCompositionPlayback>; onReady?:(ready:boolean)=>void }) {
  const media = useCompositionMedia(document.assets);
  const duration = compositionDuration(document);
  const [error, setError] = useState<string | null>(null);
  const output=compositionOutputSize(document);
  return <div className="clip-inspection__player">
    <div className="saved-composition-preview__viewport" style={{"--preview-ratio":output.width/output.height} as CSSProperties}>
      <CompositionStage document={document} media={media} frame={Math.min(playback.frame, Math.max(0, duration - 1))} playing={playback.playing} onError={setError} onReady={onReady}/>
    </div>
    <PlaybackControls time={frameToSeconds(playback.frame, document.fps)} start={0} end={frameToSeconds(duration, document.fps)} duration={frameToSeconds(duration, document.fps)}
      playing={playback.playing} enabled={duration > 0} onToggle={playback.toggle} onSeek={seconds => playback.seek(seconds * document.fps.numerator / document.fps.denominator)} />
    <input type="range" aria-label="Posição na montagem salva" min={0} max={duration} step={1} value={playback.frame} onInput={event => playback.seek(Number(event.currentTarget.value))} />
    {error && <p role="alert">{error}</p>}
  </div>;
}
