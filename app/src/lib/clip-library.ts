import { clipChangedAt, type Clip, type ClipCollection } from "./clips";
import type { ProjectMeta } from "./types";
import type { CompositionSnapshot, EditorProjectState } from "./composition-persistence";
import { compositionDuration } from "./composition";
import { frameToSeconds } from "./composition-time";

export interface LibraryClip { project: ProjectMeta; mediaId: string; clip: Clip; composition?: CompositionSnapshot }
export type LibraryFilter = "active" | "all" | "deleted";
/** Nota válida = análise presente e NÃO desatualizada (upd 20): nota antiga
 *  nunca ordena como avaliação editorial concluída. */
function editorialScore(clip: Clip): number {
  return clip.analysis && !clip.analysisStale && !clip.manuallyEdited && clip.origin !== "manual" ? clip.score ?? -1 : -1;
}
export function mergeEditorClips(project: ProjectMeta, collection: ClipCollection | null, state: EditorProjectState | null): LibraryClip[] {
  const entries = new Map((collection?.clips ?? []).map(clip => [clip.id, { project, mediaId: collection!.mediaId, clip } as LibraryClip]));
  for (const [id, snapshot] of Object.entries(state?.clips ?? {})) {
    const previous = entries.get(id);
    if (!previous && snapshot.origin !== "manual") continue;
    const duration = frameToSeconds(compositionDuration(snapshot.document), snapshot.document.fps);
    const clip: Clip = previous ? { ...previous.clip } : { id, start: 0, end: duration, title: snapshot.title!, score: null, reasons: [], review: "pending", origin: "manual", createdAtMs: snapshot.createdAtMs };
    clip.manuallyEdited = snapshot.manuallyEdited;
    clip.editedAtMs = snapshot.editedAtMs;
    if (snapshot.manuallyEdited || snapshot.origin === "manual") {
      if (typeof clip.score === "number") clip.originalScore = clip.score;
      clip.score = null;
    }
    clip.end = clip.start + duration;
    clip.format = snapshot.document.settings.ratio;
    clip.fit = snapshot.document.settings.fit;
    clip.review = snapshot.review ?? clip.review;
    clip.deleted = snapshot.deleted ?? clip.deleted;
    clip.deletedAtMs = snapshot.deleted===false?undefined:snapshot.deletedAtMs??clip.deletedAtMs;
    entries.set(id, { project, mediaId: previous?.mediaId ?? snapshot.document.assets[0]?.mediaId ?? "", clip, composition: snapshot });
  }
  return [...entries.values()];
}
export function visibleClips(entries: LibraryClip[], filter: LibraryFilter, sort: string): LibraryClip[] {
  return entries.filter(({ clip }) => filter === "all" || (filter === "active" ? !clip.deleted : clip.deleted === true)).sort((a,b) => {
    if (sort === "duration") return (a.clip.end-a.clip.start)-(b.clip.end-b.clip.start);
    if (sort === "recent") return (clipChangedAt(b.clip) ?? 0) - (clipChangedAt(a.clip) ?? 0) || a.clip.start-b.clip.start;
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
