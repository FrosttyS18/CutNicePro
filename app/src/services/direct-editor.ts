import * as ipc from "../lib/ipc";
import { loadEditorState, loadRecovery } from "../lib/composition-persistence";
import type { ProjectMeta } from "../lib/types";
import { emptyWorkspace } from "../lib/workspace";
import { readWorkspace, saveWorkspace } from "./workspace-store";

const entryKey = "cutnicepro.direct-editor.project";

export async function openEmptyEditor(projects: ProjectMeta[]): Promise<ProjectMeta> {
  let previous: string | null = null;
  try { previous = localStorage.getItem(entryKey); } catch { previous = null; }
  const candidate = projects.find(project => project.id === previous);
  if (candidate && readWorkspace(candidate.id).editorOnly === true) {
    const [saved, recovery] = await Promise.all([
      loadEditorState(candidate.id), loadRecovery({ projectId: candidate.id, clipId: null }),
    ]);
    if (!readWorkspace(candidate.id).media && !saved.project?.document.assets.length && !Object.keys(saved.clips).length && !recovery) {
      return ipc.openProject(candidate.id);
    }
  }
  const names = new Set(projects.map(project => project.name));
  let name = "Nova edição";
  for (let index = 2; names.has(name); index++) name = `Nova edição ${index}`;
  const project = await ipc.createProject(name);
  if (!saveWorkspace(project.id, { ...emptyWorkspace(), editorOnly: true })) {
    try { await ipc.deleteProject(project.id); }
    catch { throw new Error(`Não foi possível preparar a edição ${project.id}. Ela foi mantida em Meus projetos; tente abri-la novamente.`); }
    throw new Error("Não foi possível salvar a nova edição neste dispositivo. Libere espaço e tente novamente.");
  }
  try { localStorage.setItem(entryKey, project.id); } catch { return project; }
  return project;
}
