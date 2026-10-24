import { getProjectClips } from "../lib/clips";
import type { LibraryClip } from "../lib/clip-library";
import type { ProjectMeta } from "../lib/types";

/** Falha de UM projeto não pode esconder os demais (goal-recuperacao
 *  2026-10-23): cada projeto é isolado; os que falham voltam em `failed`
 *  para a UI informar perda parcial — sem fingir biblioteca vazia nem
 *  sucesso total. Falha total (todos os projetos) segue como exceção. */
export async function loadClipLibrary(projects: ProjectMeta[]): Promise<{ entries: LibraryClip[]; failed: ProjectMeta[] }> {
  const entries: LibraryClip[] = [];
  const failed: ProjectMeta[] = [];
  await Promise.all(projects.map(async project => {
    try {
      const saved = await getProjectClips(project.id);
      if (saved) entries.push(...saved.clips.map(clip => ({ project, mediaId: saved.mediaId, clip })));
    } catch {
      failed.push(project);
    }
  }));
  if (projects.length > 0 && failed.length === projects.length) {
    throw new Error("Não foi possível carregar os clipes destes projetos.");
  }
  return { entries, failed };
}
