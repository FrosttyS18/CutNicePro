import type { ProjectMeta } from "../../lib/types";
import { formatCompactDate } from "../../lib/format";
import { ErrorBanner } from "../ErrorBanner";
import { ProjectThumbnail } from "../workspace/ProjectThumbnail";

interface Props {
  projects: ProjectMeta[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onViewAll: () => void;
}

export function RecentProjects({ projects, loading, error, onRetry, onOpen, onViewAll }: Props) {
  return (
    <section className="upload-recent" aria-labelledby="upload-recent-heading" aria-busy={loading}>
      <header><h2 id="upload-recent-heading">Projetos recentes</h2>
        <button type="button" onClick={onViewAll}>Ver todos <span aria-hidden="true">›</span></button>
      </header>
      {error ? <ErrorBanner message={error} onRetry={onRetry} />
        : loading ? <p className="upload-message" role="status">Carregando projetos…</p>
        : !projects.length ? <p className="upload-message">Seus projetos aparecerão aqui. Comece escolhendo um vídeo acima.</p>
        : <ul className="upload-recent__grid">
          {projects.slice(0, 5).map((project) => (
            <li key={project.id}><button type="button" className="upload-project" onClick={() => onOpen(project.id)}>
              <ProjectThumbnail id={project.id} />
              <span className="upload-project__name">{project.name}</span>
              <span className="upload-project__date">{formatCompactDate(project.updated_at_ms)}</span>
            </button></li>
          ))}
        </ul>}
    </section>
  );
}
