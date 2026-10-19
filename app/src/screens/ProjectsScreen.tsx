import { useState } from "react";
import type { ProjectMeta } from "../lib/types";
import { formatCompactDate } from "../lib/format";
import { TabBar } from "../components/TabBar";
import { ProjectThumbnail } from "../components/workspace/ProjectThumbnail";
import { ErrorBanner } from "../components/ErrorBanner";
import { ProjectContextCard } from "../components/workspace/ProjectContextCard";
import { useClipLibrary } from "../hooks/useClipLibrary";
import { ClipGallery } from "../components/clips/ClipGallery";
import { ClipInspection } from "../components/clips/ClipInspection";
import type { LibraryClip } from "../lib/clip-library";
import type { Clip } from "../lib/clips";

interface Props {
  projects: ProjectMeta[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onCollectionsChanged?: () => Promise<void>;
  onEditClip?: (projectId: string, clip: Clip, mediaId: string) => void;
}

type LibraryTab = "all" | "clips";

/**
 * Tela 4 do design 03B — "Meus projetos - Todos".
 * Abas Todos/Clipes, card tracejado de criação e cards de projeto com
 * miniatura, badge "Novo" (nunca aberto) e data de atualização.
 */
export function ProjectsScreen({ projects, loading, error, onRetry, onCreate, onOpen, onDelete, onCollectionsChanged, onEditClip }: Props) {
  const [tab, setTab] = useState<LibraryTab>("all");
  const library = useClipLibrary(projects);
  const [inspecting,setInspecting] = useState<LibraryClip | null>(null);
  const [clipNotice,setClipNotice] = useState<string | null>(null);

  const tabs = [
    { id: "all", label: `Todos (${projects.length})` },
    { id: "clips", label: library.error ? "Clipes" : library.loading ? "Clipes (…)" : `Clipes (${library.entries.filter(entry=>entry.clip.review !== "rejected").length})` },
  ];

  return (
    <div className="lib">
      <TabBar tabs={tabs} active={tab} onSelect={(id) => setTab(id as LibraryTab)} />

      {error && (
        <ErrorBanner
          message={`Não foi possível carregar os projetos: ${error}`}
          onRetry={onRetry}
        />
      )}
      {loading && (
        <div className="state-banner" role="status">
          <span className="state-banner__text">Carregando projetos…</span>
        </div>
      )}

      {tab === "clips" ? (
        <ClipGallery entries={library.entries} loading={library.loading} error={library.error} notice={clipNotice} onRetry={library.reload} onInspect={setInspecting} showProject/>
      ) : (
        <div className="card-grid">
          <button type="button" className="new-card new-card--project" onClick={onCreate} data-testid="new-project-card">
            <span className="new-card__row">
              <span className="new-card__plus" aria-hidden="true">
                +
              </span>
              <span className="new-card__label">Novo projeto</span>
            </span>
          </button>
          {projects.map((p) => (
            <ProjectContextCard key={p.id} project={p} onDelete={onDelete} onCollectionsChanged={onCollectionsChanged}>
            <button
              type="button"
              className="pcard"
              key={p.id}
              data-testid="project-card"
              onClick={() => onOpen(p.id)}
              title={p.name}
              aria-haspopup="menu" aria-keyshortcuts="Shift+F10 ContextMenu"
            >
              <span className="pcard__thumb">
                <ProjectThumbnail id={p.id} />
                <span className="pcard__shade" aria-hidden="true" />
                {p.last_opened_at_ms === null && (
                  <span className="pcard__badge">Novo</span>
                )}
              </span>
              <span className="pcard__name">{p.name}</span>
              <span className="pcard__meta">{formatCompactDate(p.updated_at_ms)}</span>
            </button>
            </ProjectContextCard>
          ))}
        </div>
      )}
      {inspecting && <ClipInspection key={`${inspecting.project.id}:${inspecting.clip.id}`} entry={inspecting} onClose={() => setInspecting(null)} onChanged={notice=>{setClipNotice(notice ?? null);library.reload();}}
        onEdit={(projectId,clip) => { setInspecting(null); if (onEditClip) onEditClip(projectId,clip,inspecting.mediaId); else onOpen(projectId); }}/>}
    </div>
  );
}
