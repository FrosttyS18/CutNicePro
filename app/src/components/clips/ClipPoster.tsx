import { memo, useEffect, useRef, useState } from "react";
import { captionCue, effectiveCaptionStyle } from "../../lib/captions";
import { CaptionVisual } from "../editor/CaptionVisual";
import type { LibraryClip } from "../../lib/clip-library";
import type { WorkspaceData } from "../../lib/workspace-types";
import { isolatedClipSettings } from "../../lib/clips";
import { loadClipThumbnail, type ClipThumbnail } from "../../services/clip-thumbnails";
import { effectiveSegments, planDuration } from "../../lib/edit-plan";
import { SavedCompositionPoster } from "./SavedCompositionPoster";

export const ClipPoster = memo(function ClipPoster({ entry, workspace }: { entry: LibraryClip; workspace: WorkspaceData }) {
  return entry.composition ? <SavedCompositionPoster entry={entry} /> : <LegacyClipPoster entry={entry} workspace={workspace} />;
});

function LegacyClipPoster({ entry, workspace }: { entry: LibraryClip; workspace: WorkspaceData }) {
  const root = useRef<HTMLSpanElement>(null);
  const [sample, setSample] = useState<(ClipThumbnail & { mediaId: string; time: number }) | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const dimensions = sample?.mediaId === entry.mediaId ? sample : workspace.media;
  const settings = isolatedClipSettings(entry.clip, workspace.clipEdits?.[entry.clip.id], dimensions ? { ...dimensions, duration: workspace.media?.duration } : null);
  const time = settings.trimStart + Math.min(.4, ((settings.trimEnd ?? entry.clip.end) - settings.trimStart) / 2);
  const frame = sample?.mediaId === entry.mediaId && sample.time === time ? sample : null;
  const cue = captionCue(workspace.transcript, time);
  const style = effectiveCaptionStyle(settings.captionModel, settings.captionStyle);

  useEffect(() => {
    let disposed = false;
    const observer = new IntersectionObserver(items => {
      if (!items.some(item => item.isIntersecting)) return;
      observer.disconnect();
      void loadClipThumbnail(entry.mediaId, time).then(value => {
        if (!disposed) { setSample({ ...value, mediaId: entry.mediaId, time }); setUnavailable(false); }
      }).catch(() => { if (!disposed) setUnavailable(true); });
    }, { rootMargin: "180px" });
    if (root.current) observer.observe(root.current);
    return () => { disposed = true; observer.disconnect(); };
  }, [entry.mediaId, time]);

  return <span className="clip-card__poster" ref={root} style={{ aspectRatio: settings.ratio.replace(":", "/") }}>
    {frame && <img src={frame.src} alt="" loading="lazy" decoding="async" style={{ objectFit: settings.fit, objectPosition: `${settings.focalPoint?.x ?? 50}% ${settings.focalPoint?.y ?? 50}%` }} />}
    {unavailable && <span className="clip-card__unavailable">Prévia indisponível</span>}
    {settings.captionModel > 0 && cue && <span className="clip-card__caption" data-position={style.position}><CaptionVisual cue={cue} style={style} ratio={Number(settings.ratio.split(":")[0]) / Number(settings.ratio.split(":")[1])} /></span>}
    <span className="clip-card__duration">{Math.round(planDuration(effectiveSegments(settings, workspace.media?.duration ?? entry.clip.end)))} s</span>
  </span>;
}
