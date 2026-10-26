import { memo, useEffect, useState } from "react";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import { MusicNoteIcon } from "@phosphor-icons/react/dist/csr/MusicNote";
import { loadClipThumbnail, type ClipThumbnail } from "../../services/clip-thumbnails";
import type { CompositionAsset } from "../../lib/composition-types";

interface Props {
  asset: CompositionAsset;
  preview?: string;
  imageUrl?: string | null;
}

export const CompositionMediaPoster = memo(function CompositionMediaPoster({ asset, preview, imageUrl }: Props) {
  const [sample, setSample] = useState<(ClipThumbnail & { key: string }) | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const time = Math.min(.4, Math.max(0, asset.durationUs / 2e6));
  const key = `${asset.mediaId}:${time}`;
  useEffect(() => {
    if (asset.kind !== "video") return;
    let disposed = false;
    void loadClipThumbnail(asset.mediaId, time).then(frame => {
      if (!disposed) setSample({ ...frame, key });
    }).catch(() => { if (!disposed) setFailed(key); });
    return () => { disposed = true; };
  }, [asset.kind, asset.mediaId, key, time]);
  const frame = sample?.key === key ? sample : null;
  const src = asset.kind === "image" ? imageUrl : asset.kind === "video" ? frame?.src ?? preview : null;
  const Icon = asset.kind === "audio" ? MusicNoteIcon : asset.kind === "image" ? ImageIcon : FilmStripIcon;
  return <span className="composition-media__poster" aria-busy={asset.kind === "video" && !src && failed !== key}>
    {src ? <img src={src} alt="" width={frame?.width || asset.width || 160} height={frame?.height || asset.height || 100} loading="lazy" decoding="async" />
      : <><Icon size={30} aria-hidden="true" />{asset.kind === "video" && failed === key && <span className="sr-only">Prévia indisponível</span>}</>}
  </span>;
});
