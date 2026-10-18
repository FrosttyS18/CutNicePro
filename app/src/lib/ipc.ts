/**
 * Camada de IPC — único ponto de contato com os comandos Tauri (Rust).
 * A UI nunca chama invoke diretamente; erros chegam como string legível.
 */
import { invoke } from "@tauri-apps/api/core";
import type { ProjectMeta } from "./types";

export async function listProjects(): Promise<ProjectMeta[]> {
  return invoke<ProjectMeta[]>("list_projects");
}

export async function createProject(name: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("create_project", { name });
}

export async function openProject(id: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("open_project", { id });
}
