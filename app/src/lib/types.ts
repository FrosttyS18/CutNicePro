/** Tipos compartilhados do domínio de projetos (espelham src-tauri/src/storage.rs). */
export interface ProjectMeta {
  id: string;
  name: string;
  created_at_ms: number;
  updated_at_ms: number;
  last_opened_at_ms: number | null;
}
