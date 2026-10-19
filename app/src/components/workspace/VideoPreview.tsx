import { useEffect, useRef, useState, type RefObject, type CSSProperties } from "react";
import type { EditorSettings, SourceDescriptor } from "../../lib/workspace-types";
import { effectiveCaptionStyle, type CaptionCue } from "../../lib/captions";
import { CaptionVisual } from "../editor/CaptionVisual";
import "../editor/captions.css";

interface Props {
  media: SourceDescriptor | null;
  localUrl: string | null;
  settings: EditorSettings;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onTime?: (time: number) => void;
  onDuration?: (duration: number) => void;
  cue?: CaptionCue | null;
  nativeControls?: boolean;
  onTogglePlay?: () => void;
  original?: boolean;
}

export function VideoPreview({ media, localUrl, settings, videoRef, onTime, onDuration, cue, nativeControls=true, onTogglePlay, original=false }: Props) {
  const fallback = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? fallback;
  const [error, setError] = useState(false);
  const timeHandler = useRef(onTime);
  timeHandler.current = onTime;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now-last >= 50) { timeHandler.current?.(element.currentTime); last=now; }
      if (!element.paused) frame=requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(frame); frame=requestAnimationFrame(tick); };
    const stop = () => { cancelAnimationFrame(frame); timeHandler.current?.(element.currentTime); };
    element.addEventListener("play",start); element.addEventListener("pause",stop);
    if (!element.paused) start();
    return () => { cancelAnimationFrame(frame); element.removeEventListener("play",start); element.removeEventListener("pause",stop); };
  },[ref,localUrl]);
  useEffect(() => setError(false), [localUrl, media?.videoId]);
  useEffect(() => {
    if (ref.current) { ref.current.volume = original ? 1 : settings.volume; ref.current.muted = original ? false : settings.muted; }
  }, [settings.volume, settings.muted, ref, localUrl,original]);
  const ratio = original ? (media?.width && media?.height ? media.width/media.height : 16/9) : Number(settings.ratio.split(":")[0])/Number(settings.ratio.split(":")[1]);
  return (
    <div className="workspace-preview" data-original={original} style={{ aspectRatio: ratio, background: original ? "#000000" : settings.background,
      "--preview-ratio": ratio } as CSSProperties}>
      {media?.kind === "youtube" && media.videoId ? <iframe
        src={`https://www.youtube-nocookie.com/embed/${media.videoId}`} title="Vídeo de origem no YouTube"
        allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : localUrl ? <video ref={ref} key={localUrl} src={localUrl} crossOrigin="anonymous" controls={nativeControls} playsInline preload="metadata"
          style={{ objectFit: original ? "contain" : settings.fit, objectPosition: original ? "50% 50%" : `${settings.focalPoint?.x ?? 50}% ${settings.focalPoint?.y ?? 50}%` }} aria-label={`Prévia de ${media?.name ?? "vídeo"}`}
          tabIndex={nativeControls ? undefined : 0} aria-keyshortcuts={nativeControls ? undefined : "Space"}
          onError={() => setError(true)} onTimeUpdate={(event) => onTime?.(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) onDuration?.(event.currentTarget.duration);
          }} onDurationChange={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) onDuration?.(event.currentTarget.duration);
          }} />
        : <div className="workspace-preview__empty"><span aria-hidden="true">▷</span><p>{media ? "Reconecte o vídeo deste projeto" : "Nenhum vídeo neste projeto"}</p></div>}
      {localUrl && <button type="button" className="video-surface-toggle" data-native-controls={nativeControls} aria-label="Reproduzir ou pausar vídeo"
        tabIndex={-1} onClick={() => {
          ref.current?.focus({ preventScroll: true });
          if (onTogglePlay) { onTogglePlay(); return; }
          const element = ref.current;
          if (element?.paused) void element.play().catch(() => setError(true)); else element?.pause();
        }}/>}
      {error && <p className="workspace-preview__error" role="alert">Não foi possível reproduzir este arquivo. Reconecte um vídeo compatível.</p>}
      {!original && settings.text && <span className="workspace-preview__text">{settings.text}</span>}
      {!original && settings.captionModel>0 && cue && <div className="caption-overlay" data-position={effectiveCaptionStyle(settings.captionModel,settings.captionStyle).position} aria-label="Legenda">
        <CaptionVisual style={effectiveCaptionStyle(settings.captionModel,settings.captionStyle)} ratio={Number(settings.ratio.split(":")[0])/Number(settings.ratio.split(":")[1])} cue={cue}/>
      </div>}
    </div>
  );
}
