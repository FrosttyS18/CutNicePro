/**
 * Camada de IPC — único ponto de contato com os comandos Tauri (Rust).
 * A UI nunca chama invoke diretamente; erros chegam como string legível.
 */
import { invoke } from "@tauri-apps/api/core";
import type { CollectionIcon, CollectionMeta, ProjectMeta } from "./types";

export async function listProjects(): Promise<ProjectMeta[]> {
  return invoke<ProjectMeta[]>("list_projects");
}

export async function createProject(name: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("create_project", { name });
}

export async function openProject(id: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("open_project", { id });
}

export async function renameProject(id: string, name: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("rename_project", { id, name });
}

// ---- Coleções (Fase 03B; arquivo próprio, retrocompatível) ----

export async function listCollections(): Promise<CollectionMeta[]> {
  return invoke<CollectionMeta[]>("list_collections");
}

export async function createCollection(
  name: string,
  icon: CollectionIcon,
): Promise<CollectionMeta> {
  return invoke<CollectionMeta>("create_collection", { name, icon });
}

export async function addProjectToCollection(
  collectionId: string,
  projectId: string,
): Promise<CollectionMeta> {
  return invoke<CollectionMeta>("add_project_to_collection", { collectionId, projectId });
}

export async function removeProjectFromCollection(
  collectionId: string,
  projectId: string,
): Promise<CollectionMeta> {
  return invoke<CollectionMeta>("remove_project_from_collection", {
    collectionId,
    projectId,
  });
}
