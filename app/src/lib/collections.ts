/** Regras puras de coleções e plurais pt-BR — testadas em vitest. */
import type { CollectionIcon, CollectionMeta, ProjectMeta } from "./types";

export const COLLECTION_NAME_MAX = 80;
export const COLLECTION_ICONS: readonly CollectionIcon[] = ["heart", "archive-box"];

export interface CollectionValidation {
  ok: boolean;
  error: string | null;
}

export function validateCollectionName(raw: string): CollectionValidation {
  const name = raw.trim();
  if (name.length === 0) {
    return { ok: false, error: "Informe um nome para a coleção." };
  }
  if (name.length > COLLECTION_NAME_MAX) {
    return {
      ok: false,
      error: `Nome muito longo (máximo ${COLLECTION_NAME_MAX} caracteres).`,
    };
  }
  return { ok: true, error: null };
}

/** Plural pt-BR simples para as unidades usadas na UI. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function projectCount(collection: CollectionMeta): number {
  return collection.project_ids.length;
}

/** Projetos de uma coleção, na ordem de adição, ignorando ids órfãos. */
export function projectsOf(collection: CollectionMeta, projects: ProjectMeta[]): ProjectMeta[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return collection.project_ids
    .map((id) => byId.get(id))
    .filter((p): p is ProjectMeta => Boolean(p));
}

export function sortCollections(collections: CollectionMeta[]): CollectionMeta[] {
  return [...collections].sort((a, b) => b.updated_at_ms - a.updated_at_ms);
}
