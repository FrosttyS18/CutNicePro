import type { Clip, ClipReview } from "./clips";
import type { ProjectMeta } from "./types";

export interface LibraryClip { project: ProjectMeta; mediaId: string; clip: Clip }
export type LibraryFilter = "active" | "all" | "deleted" | ClipReview;
/** Nota válida = análise presente e NÃO desatualizada (upd 20): nota antiga
 *  nunca ordena como avaliação editorial concluída. */
function editorialScore(clip: Clip): number {
  return clip.analysis && !clip.analysisStale ? clip.score : -1;
}
export function visibleClips(entries: LibraryClip[], filter: LibraryFilter, sort: string): LibraryClip[] {
  return entries.filter(({ clip }) => filter === "all" || (filter === "active" ? clip.review !== "rejected" && !clip.deleted : filter === "deleted" ? clip.deleted === true : clip.review === filter && !clip.deleted)).sort((a,b) => {
    if (sort === "duration") return (a.clip.end-a.clip.start)-(b.clip.end-b.clip.start);
    if (sort === "recent") return (b.clip.createdAtMs ?? 0) - (a.clip.createdAtMs ?? 0) || a.clip.start-b.clip.start;
    if (sort === "time" || sort === "project") return a.project.name.localeCompare(b.project.name) || a.clip.start-b.clip.start;
    return editorialScore(b.clip)-editorialScore(a.clip) || a.clip.start-b.clip.start;
  });
}

export function groupClipsByProject(entries: LibraryClip[]): { project: ProjectMeta; entries: LibraryClip[] }[] {
  const groups = new Map<string, { project: ProjectMeta; entries: LibraryClip[] }>();
  for (const entry of entries) {
    let group = groups.get(entry.project.id);
    if (!group) {
      group = { project: entry.project, entries: [] };
      groups.set(entry.project.id, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()].sort((a, b) => a.project.name.localeCompare(b.project.name) || a.project.id.localeCompare(b.project.id));
}
