import { useEffect, useMemo, useState } from "react";
import { AppSelect } from "../AppSelect";
import { ClipCard, type ClipCardActions } from "./ClipCard";
import { groupClipsByProject, visibleClips, type LibraryClip, type LibraryFilter } from "../../lib/clip-library";
import { readWorkspace } from "../../services/workspace-store";
import type { WorkspaceData } from "../../lib/workspace-types";
import "./clip-library.css";

interface Props extends ClipCardActions {
  entries: LibraryClip[];
  loading?: boolean;
  error?: string | null;
  notice?: string | null;
  showProject?: boolean;
  onRetry?: () => void;
  undoDelete?: { onUndo: () => void } | null;
}

export function ClipGallery({ entries, loading, error, notice, showProject, onRetry, undoDelete, ...actions }: Props) {
  const [filter, setFilter] = useState<LibraryFilter>("active");
  const [sort, setSort] = useState(showProject ? "project" : "score");
  const [now, setNow] = useState(Date.now);
  const visible = useMemo(() => visibleClips(entries, filter, sort), [entries, filter, sort]);
  const groups = useMemo(() => groupClipsByProject(visible), [visible]);
  const workspaces = useMemo(() => {
    const values = new Map<string, WorkspaceData>();
    for (const entry of entries) {
      if (!values.has(entry.project.id)) values.set(entry.project.id, readWorkspace(entry.project.id));
    }
    return values;
  }, [entries]);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  const cards = (items: LibraryClip[]) => items.map(entry =>
    <ClipCard key={`${entry.project.id}:${entry.clip.id}`} entry={entry} workspace={workspaces.get(entry.project.id)!} now={now} showProject={showProject} {...actions} />);

  return <section className="clip-library" aria-label="Clipes">
    <header className="clip-library__toolbar">
      <h2>{loading ? "Carregando clipes…" : `${visible.length} ${visible.length === 1 ? "clipe" : "clipes"}`}</h2>
      <div>
        <AppSelect aria-label="Filtrar clipes" value={filter} onChange={event => setFilter(event.target.value as LibraryFilter)}>
          <option value="active">Ativos</option><option value="all">Todos</option><option value="pending">Para revisar</option><option value="approved">Aprovados</option><option value="rejected">Rejeitados</option><option value="deleted">Excluídos</option>
        </AppSelect>
        <AppSelect aria-label="Ordenar clipes" value={sort} onChange={event => setSort(event.target.value)}>
          {showProject && <option value="project">Por projeto</option>}
          <option value="recent">Mais recentes</option><option value="score">Maior nota</option><option value="duration">Menor duração</option><option value="time">Ordem do vídeo</option>
        </AppSelect>
      </div>
    </header>
    {notice && <p role="status">{notice}{undoDelete && <button type="button" className="flow-button" onClick={undoDelete.onUndo}>Desfazer</button>}</p>}
    {loading && <p role="status">Carregando clipes…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="flow-button" onClick={onRetry}>Tentar novamente</button></div>}
    {!loading && !error && !visible.length && <div className="lib__empty"><h3>{entries.length ? "Nenhum clipe neste filtro" : "Nenhum clipe ainda"}</h3><p>{entries.length ? "Escolha outro filtro para ver seus clipes." : "Abra um projeto para criar um clipe da montagem ou gerar cortes."}</p></div>}
    {showProject ? <div className="clip-project-groups">{groups.map(group =>
      <section className="clip-project-group" key={group.project.id} aria-label={`Clipes de ${group.project.name}`}>
        <header><h3>{group.project.name}</h3><span>{group.entries.length} {group.entries.length === 1 ? "clipe" : "clipes"}</span></header>
        <div className="clip-gallery">{cards(group.entries)}</div>
      </section>)}</div>
      : <div className="clip-gallery">{cards(visible)}</div>}
  </section>;
}
