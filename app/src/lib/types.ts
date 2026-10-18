/** Tipos compartilhados do domínio (espelham src-tauri/src/storage.rs). */
export interface ProjectMeta {
  id: string;
  name: string;
  created_at_ms: number;
  updated_at_ms: number;
  last_opened_at_ms: number | null;
}

export type CollectionIcon = "heart" | "archive-box";

export interface CollectionMeta {
  id: string;
  name: string;
  icon: CollectionIcon;
  created_at_ms: number;
  updated_at_ms: number;
  project_ids: string[];
}
