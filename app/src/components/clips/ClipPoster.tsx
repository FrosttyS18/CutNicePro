import { useEffect, useRef, useState } from "react";
import { getMedia, mediaUrl } from "../../lib/ipc";
import { readWorkspace } from "../../services/workspace-store";
import { captionCue, effectiveCaptionStyle } from "../../lib/captions";
import { CaptionVisual } from "../editor/CaptionVisual";
import type { LibraryClip } from "../../lib/clip-library";
import { isolatedClipSettings } from "../../lib/clips";

export function ClipPoster({ entry }: { entry: LibraryClip }) {
  const root = useRef<HTMLSpanElement>(null);
  const [url,setUrl] = useState<string | null>(null);
  const [unavailable,setUnavailable] = useState(false);
  const [dimensions,setDimensions] = useState<{width:number;height:number} | null>(null);
  const data = readWorkspace(entry.project.id);
  const settings = isolatedClipSettings(entry.clip,data.clipEdits?.[entry.clip.id],dimensions ?? data.media);
  const time = entry.clip.start + Math.min(.4,(entry.clip.end-entry.clip.start)/2);
  const cue = captionCue(data.transcript,time);
  useEffect(() => {
    let disposed = false;
    const observer = new IntersectionObserver(items => {
      if (!items.some(item => item.isIntersecting)) return;
      observer.disconnect();
      void getMedia(entry.mediaId).then(media => {
        if (disposed) return;
        if (!media || media.unavailable) setUnavailable(true); else {
          setUrl(mediaUrl(media));
          if (media.analysis) setDimensions({width:media.analysis.width,height:media.analysis.height});
        }
      }).catch(() => { if (!disposed) setUnavailable(true); });
    }, { rootMargin: "180px" });
    if (root.current) observer.observe(root.current);
    return () => { disposed = true; observer.disconnect(); };
  }, [entry.mediaId]);
  return <span className="clip-card__poster" ref={root} style={{ aspectRatio: settings.ratio.replace(":","/") }}>
    {url && <video src={url} muted playsInline preload="metadata" aria-hidden="true" style={{ objectFit: settings.fit,objectPosition: `${settings.focalPoint?.x ?? 50}% ${settings.focalPoint?.y ?? 50}%` }}
      onLoadedMetadata={event => { event.currentTarget.currentTime = time; }} onError={() => setUnavailable(true)}/>}
    {unavailable && <span className="clip-card__unavailable">Prévia indisponível</span>}
    {settings.captionModel > 0 && cue && <span className="clip-card__caption" data-position={effectiveCaptionStyle(settings.captionModel,settings.captionStyle).position}><CaptionVisual cue={cue} style={effectiveCaptionStyle(settings.captionModel,settings.captionStyle)} ratio={Number(settings.ratio.split(":")[0])/Number(settings.ratio.split(":")[1])}/></span>}
    <span className="clip-card__duration">{Math.round(entry.clip.end-entry.clip.start)} s</span>
  </span>;
}
