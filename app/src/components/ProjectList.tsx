import { formatDate } from "../lib/format";
import type { ProjectMeta } from "../lib/types";

interface Props {
  projects: ProjectMeta[];
  onOpen: (id: string) => void;
}

export function ProjectList({ projects, onOpen }: Props) {
  return (
    <div className="project-list">
      {projects.map((p) => (
        <div className="project-card" key={p.id} data-testid="project-card">
          <p className="project-card__name">{p.name}</p>
          <div className="project-card__meta">
            <span>Criado em {formatDate(p.created_at_ms)}</span>
            <span>
              {p.last_opened_at_ms
                ? `Aberto em ${formatDate(p.last_opened_at_ms)}`
                : "Nunca aberto"}
            </span>
          </div>
          <div className="project-card__actions">
            <button className="btn btn--primary" onClick={() => onOpen(p.id)}>
              Abrir projeto
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
