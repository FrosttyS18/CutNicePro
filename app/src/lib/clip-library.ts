import type { Clip, ClipReview } from "./clips";
import type { ProjectMeta } from "./types";

export interface LibraryClip { project: ProjectMeta; mediaId: string; clip: Clip }
export function visibleClips(entries: LibraryClip[], filter: "all" | ClipReview, sort: string): LibraryClip[] {
  return entries.filter(({ clip }) => filter === "all" || clip.review === filter).sort((a,b) => {
    if (sort === "duration") return (a.clip.end-a.clip.start)-(b.clip.end-b.clip.start);
    if (sort === "time") return a.project.name.localeCompare(b.project.name) || a.clip.start-b.clip.start;
    return b.clip.score-a.clip.score || a.clip.start-b.clip.start;
  });
}
