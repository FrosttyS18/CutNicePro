import { useState } from "react";
import type { ProjectMeta } from "../lib/types";
import { formatCompactDate } from "../lib/format";
import { TabBar } from "../components/TabBar";
import thumbUrl from "../assets/thumb-mock-projeto.png";
import { ErrorBanner } from "../components/ErrorBanner";

interface Props {
  projects: ProjectMeta[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
}

type LibraryTab = "all" | "clips";

/**
 * Tela 4 do design 03B — "Meus projetos - Todos".
 * Abas Todos/Clipes, card tracejado de criação e cards de projeto com
 * miniatura, badge "Novo" (nunca aberto) e data de atualização.
 */
export function ProjectsScreen({ projects, loading, error, onRetry, onCreate, onOpen }: Props) {
  const [tab, setTab] = useState<LibraryTab>("all");

  const tabs = [
    { id: "all", label: `Todos (${projects.length})` },
    { id: "clips", label: "Clipes (0)" },
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
        <div className="lib__empty">
          <p className="lib__empty-title">Nenhum clipe ainda</p>
          <p className="lib__empty-text">
            Clipes são gerados a partir dos vídeos dos seus projetos.
          </p>
        </div>
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
            <button
              type="button"
              className="pcard"
              key={p.id}
              data-testid="project-card"
              onClick={() => onOpen(p.id)}
              title={p.name}
            >
              <span className="pcard__thumb">
                <img src={thumbUrl} alt="" aria-hidden="true" width={221} height={109} />
                <span className="pcard__shade" aria-hidden="true" />
                {p.last_opened_at_ms === null && (
                  <span className="pcard__badge">Novo</span>
                )}
              </span>
              <span className="pcard__name">{p.name}</span>
              <span className="pcard__meta">{formatCompactDate(p.updated_at_ms)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
