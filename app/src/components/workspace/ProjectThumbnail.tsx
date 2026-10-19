import { useState } from "react";
import { getSessionMedia, readWorkspace } from "../../services/workspace-store";

export function ProjectThumbnail({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  const local = getSessionMedia(id);
  const media = readWorkspace(id).media;
  return <span className="project-thumbnail" aria-hidden="true">
    {!failed && local ? <video src={local} muted playsInline preload="metadata" onError={() => setFailed(true)} />
      : !failed && media?.kind === "youtube" && media.videoId ? <img src={`https://i.ytimg.com/vi/${media.videoId}/hqdefault.jpg`}
        alt="" loading="lazy" onError={() => setFailed(true)} />
      : <span className="project-thumbnail__fallback">▷</span>}
  </span>;
}
