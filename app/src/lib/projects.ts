/** Validação e ordenação puras da UI — testadas em vitest. */
import type { ProjectMeta } from "./types";

export const PROJECT_NAME_MAX = 80;

export interface NameValidation {
  ok: boolean;
  error: string | null;
}

export function validateProjectName(raw: string): NameValidation {
  const name = raw.trim();
  if (name.length === 0) {
    return { ok: false, error: "Informe um nome para o projeto." };
  }
  if (name.length > PROJECT_NAME_MAX) {
    return {
      ok: false,
      error: `Nome muito longo (máximo ${PROJECT_NAME_MAX} caracteres).`,
    };
  }
  return { ok: true, error: null };
}

/** Ordena por última abertura (mais recente primeiro); nunca abertos por criação. */
export function sortProjects(projects: ProjectMeta[]): ProjectMeta[] {
  return [...projects].sort((a, b) => {
    const la = a.last_opened_at_ms ?? a.created_at_ms;
    const lb = b.last_opened_at_ms ?? b.created_at_ms;
    if (lb !== la) return lb - la;
    return b.created_at_ms - a.created_at_ms;
  });
}
