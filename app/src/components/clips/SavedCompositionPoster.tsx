import { useEffect, useRef, useState } from "react";
import { getEditorThumbnail } from "../../lib/ipc";
import { compositionDuration } from "../../lib/composition";
import { frameToSeconds } from "../../lib/composition-time";
import type { LibraryClip } from "../../lib/clip-library";

export function SavedCompositionPoster({ entry }: { entry: LibraryClip }) {
  const root = useRef<HTMLSpanElement>(null);
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const snapshot = entry.composition!;
  const key = `${entry.project.id}:${entry.clip.id}:${snapshot.document.revision}`;
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(value => value.isIntersecting)) return;
      observer.disconnect();
      void getEditorThumbnail(entry.project.id, entry.clip.id, snapshot.document.revision).then(bytes => {
        if (!active) return;
        if (!Array.isArray(bytes) || bytes.length > 512 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || !bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error("Miniatura inválida");
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
        setImage({ key, url }); setFailed(false);
      }).catch(() => { if (active) setFailed(true); });
    }, { rootMargin: "180px" });
    if (root.current) observer.observe(root.current);
    return () => { active = false; observer.disconnect(); if (url) URL.revokeObjectURL(url); };
  }, [entry.project.id, entry.clip.id, snapshot.document.revision, key]);
  return <span className="clip-card__poster" ref={root} style={{ aspectRatio: snapshot.document.settings.ratio.replace(":", "/") }}>
    {image?.key === key && <img src={image.url} alt="" loading="lazy" decoding="async" />}
    {failed && <span className="clip-card__unavailable">Prévia indisponível</span>}
    <span className="clip-card__duration">{Math.round(frameToSeconds(compositionDuration(snapshot.document), snapshot.document.fps))} s</span>
  </span>;
}
