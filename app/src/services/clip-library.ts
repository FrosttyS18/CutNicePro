import { getProjectClips } from "../lib/clips";
import type { LibraryClip } from "../lib/clip-library";
import type { ProjectMeta } from "../lib/types";

export async function loadClipLibrary(projects: ProjectMeta[]): Promise<LibraryClip[]> {
  const entries: LibraryClip[] = [];
  for (const project of projects) {
    const saved = await getProjectClips(project.id);
    if (saved) entries.push(...saved.clips.map(clip => ({project,mediaId:saved.mediaId,clip})));
  }
  return entries;
}
