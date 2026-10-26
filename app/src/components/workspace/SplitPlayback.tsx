import { useEffect, useRef, useState, type RefObject } from "react";
import { PlaybackControls } from "../editor/PlaybackControls";

interface Props {
  video: RefObject<HTMLVideoElement | null>;
  localUrl: string;
  onToggle?: () => void;
  onError: () => void;
}

export function SplitPlayback({ video, localUrl, onToggle, onError }: Props) {
  const [state, setState] = useState({ time: 0, duration: 0, playing: false });
  const frame = useRef(0);
  const pending = useRef(0);
  const player = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    player.current = element;
    const update = () => setState({ time: element.currentTime, duration: Number.isFinite(element.duration) ? element.duration : 0, playing: !element.paused });
    const events = ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended"];
    events.forEach(event => element.addEventListener(event, update));
    update();
    return () => {
      events.forEach(event => element.removeEventListener(event, update));
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      player.current = null;
    };
  }, [video, localUrl]);
  const seek = (time: number) => {
    const element = player.current;
    if (!element || state.duration <= 0) return;
    element.currentTime = Math.max(0, Math.min(state.duration, time));
  };
  return <div className="split-playback">
    <PlaybackControls time={state.time} start={0} end={state.duration} duration={state.duration} playing={state.playing} enabled={state.duration > 0}
      onSeek={seek} onToggle={() => {
        if (onToggle) { onToggle(); return; }
        const element = video.current;
        if (element?.paused) void element.play().catch(onError); else element?.pause();
      }}/>
    <input type="range" aria-label="Posição da prévia" min={0} max={state.duration || 1} step={0.01} value={state.time} disabled={state.duration <= 0}
      onChange={event => {
        pending.current = Number(event.target.value);
        setState(current => ({ ...current, time: pending.current }));
        if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; seek(pending.current); });
      }}/>
  </div>;
}
