import { useEffect, useRef, useState, type RefObject, type CSSProperties } from "react";
import type { EditorSettings, SourceDescriptor } from "../../lib/workspace-types";

interface Props {
  media: SourceDescriptor | null;
  localUrl: string | null;
  settings: EditorSettings;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onTime?: (time: number) => void;
  onDuration?: (duration: number) => void;
  caption?: string;
}

export function VideoPreview({ media, localUrl, settings, videoRef, onTime, onDuration, caption }: Props) {
  const fallback = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? fallback;
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [localUrl, media?.videoId]);
  useEffect(() => {
    if (ref.current) { ref.current.volume = settings.volume; ref.current.muted = settings.muted; }
  }, [settings.volume, settings.muted, ref, localUrl]);
  return (
    <div className="workspace-preview" style={{ aspectRatio: settings.ratio.replace(":", "/"), background: settings.background,
      "--preview-ratio": Number(settings.ratio.split(":")[0]) / Number(settings.ratio.split(":")[1]) } as CSSProperties}>
      {media?.kind === "youtube" && media.videoId ? <iframe
        src={`https://www.youtube-nocookie.com/embed/${media.videoId}`} title="Vídeo de origem no YouTube"
        allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : localUrl ? <video ref={ref} key={localUrl} src={localUrl} controls playsInline preload="metadata"
          style={{ objectFit: settings.fit }} aria-label={`Prévia de ${media?.name ?? "vídeo"}`}
          onError={() => setError(true)} onTimeUpdate={(event) => onTime?.(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) onDuration?.(event.currentTarget.duration);
          }} onDurationChange={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) onDuration?.(event.currentTarget.duration);
          }} />
        : <div className="workspace-preview__empty"><span aria-hidden="true">▷</span><p>{media ? "Reconecte o vídeo deste projeto" : "Nenhum vídeo neste projeto"}</p></div>}
      {error && <p className="workspace-preview__error" role="alert">Não foi possível reproduzir este arquivo. Reconecte um vídeo compatível.</p>}
      {settings.text && <span className="workspace-preview__text">{settings.text}</span>}
      {caption && <span className="workspace-preview__caption" data-model={settings.captionModel} aria-label="Legenda de demonstração">{caption.slice(0, 90)}</span>}
    </div>
  );
}
