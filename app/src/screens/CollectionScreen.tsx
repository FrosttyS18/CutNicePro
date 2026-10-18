import { useEffect, useState } from "react";
import type { ProjectMeta } from "../lib/types";
import { plural } from "../lib/collections";
import { formatCompactDate } from "../lib/format";
import { TabBar } from "../components/TabBar";
import { IconArchiveBox, IconHeart } from "../components/icons";
import thumbUrl from "../assets/thumb-mock-projeto.png";

interface AddProjectsProps {
  projects: ProjectMeta[];
  onAdd: (projectId: string) => void;
  onClose: () => void;
}

/**
 * Diálogo de adição de projetos à coleção — apenas projetos que ainda
 * não pertencem à coleção, com seleção múltipla e confirmação única.
 */
export function AddProjectsDialog({
  projects,
  onAdd,
  onClose,
}: AddProjectsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (projects.length === 0) onClose();
  }, [projects, onClose]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    setSubmitting(true);
    for (const id of selected) onAdd(id);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Adicionar projetos à coleção"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !submitting) onClose();
      }}
    >
      <div className="modal">
        <h2 className="modal__title">Adicionar projetos à coleção</h2>
        {projects.length === 0 ? (
          <p className="modal__error">Todos os seus projetos já estão nesta coleção.</p>
        ) : (
          <ul className="add-list">
            {projects.map((p) => (
              <li key={p.id}>
                <label className="add-list__item">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    disabled={submitting}
                  />
                  <span className="add-list__name">{p.name}</span>
                  <span className="add-list__meta">{formatCompactDate(p.updated_at_ms)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            onClick={() => void confirm()}
            disabled={submitting || selected.size === 0}
            data-testid="confirm-add-projects"
          >
            {submitting ? "Adicionando…" : `Adicionar (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CollectionScreenProps {
  name: string;
  icon: string;
  updatedAtMs: number;
  projects: ProjectMeta[];
  allProjects: ProjectMeta[];
  onAdd: (projectId: string) => void;
  onRemove: (projectId: string) => void;
  onOpen: (projectId: string) => void;
}

type InnerTab = "all" | "projects" | "clips";

/**
 * Tela 6 do design 03B — "Coleções > Pasta de coleção".
 * Header com ícone/caixa, nome, contadores e última atualização; abas
 * compactas; grade com card de adição e cards de projeto (com remoção).
 */
export function CollectionScreen({
  name,
  icon,
  updatedAtMs,
  projects,
  allProjects,
  onAdd,
  onRemove,
  onOpen,
}: CollectionScreenProps) {
  const [tab, setTab] = useState<InnerTab>("all");
  const [addOpen, setAddOpen] = useState(false);

  const inside = projects;
  const outside = allProjects.filter((p) => !inside.some((i) => i.id === p.id));

  const tabs = [
    { id: "all", label: `Todos (${inside.length})` },
    { id: "projects", label: `Projetos (${inside.length})` },
    { id: "clips", label: "Clipes (0)" },
  ];

  return (
    <div className="lib">
      <div className="coll-head">
        <span className="coll-head__icon">
          {icon === "heart" ? <IconHeart size={22} /> : <IconArchiveBox size={22} />}
        </span>
        <div className="coll-head__titles">
          <h2 className="coll-head__name" data-testid="collection-title">
            {name}
          </h2>
          <p className="coll-head__meta">
            {plural(inside.length, "projeto", "projetos")} ❘ {plural(0, "clipe", "clipes")}
            <span className="coll-head__sep"> </span>
            <span className="coll-head__updated-inline">
              Última atualização: {formatCompactDate(updatedAtMs)}
            </span>
          </p>
        </div>
        <div className="coll-head__spacer" />
      </div>

      <TabBar tabs={tabs} active={tab} onSelect={(id) => setTab(id as InnerTab)} compact />

      {tab === "clips" ? (
        <div className="lib__empty">
          <p className="lib__empty-title">Nenhum clipe ainda</p>
          <p className="lib__empty-text">
            Clipes são gerados a partir dos vídeos dos seus projetos.
          </p>
        </div>
      ) : (
        <div className="card-grid">
          <button
            type="button"
            className="new-card new-card--project"
            onClick={() => setAddOpen(true)}
            data-testid="add-project-to-collection"
          >
            <span className="new-card__row">
              <span className="new-card__plus" aria-hidden="true">
                +
              </span>
              <span className="new-card__label">Adicionar projeto</span>
            </span>
          </button>
          {inside.map((p) => (
            <div className="pcard__wrap" key={p.id}>
              <button
                type="button"
                className="pcard"
                data-testid="project-card"
                onClick={() => onOpen(p.id)}
                title={p.name}
              >
                <span className="pcard__thumb">
                  <img src={thumbUrl} alt="" aria-hidden="true" width={221} height={109} />
                  <span className="pcard__shade" aria-hidden="true" />
                  {p.last_opened_at_ms === null && <span className="pcard__badge">Novo</span>}
                </span>
                <span className="pcard__name">{p.name}</span>
                <span className="pcard__meta">{formatCompactDate(p.updated_at_ms)}</span>
              </button>
              <button
                type="button"
                className="pcard__remove"
                title={`Remover ${p.name} da coleção`}
                aria-label={`Remover ${p.name} da coleção`}
                onClick={() => onRemove(p.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddProjectsDialog
          projects={outside}
          onAdd={onAdd}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
