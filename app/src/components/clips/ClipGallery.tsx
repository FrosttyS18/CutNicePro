import { useEffect, useMemo, useState } from "react";
import { AppSelect } from "../AppSelect";
import { ClipCard, type ClipCardActions } from "./ClipCard";
import { ClipProjectGroup } from "./ClipProjectGroup";
import { groupClipsByProject, visibleClips, type LibraryClip, type LibraryFilter } from "../../lib/clip-library";
import { readWorkspace } from "../../services/workspace-store";
import type { WorkspaceData } from "../../lib/workspace-types";
import { ClipPurgeDialog } from "./ClipPurgeDialog";
import { useClipTrashExpiry } from "../../hooks/useClipTrashExpiry";
import "./clip-library.css";

interface Props extends ClipCardActions {
  onPurge?: (entry:LibraryClip)=>Promise<void>;
  entries: LibraryClip[];
  loading?: boolean;
  error?: string | null;
  notice?: string | null;
  showProject?: boolean;
  active?: boolean;
  onRetry?: () => void;
  undoDelete?: { onUndo: () => void } | null;
}

export function ClipGallery({ entries, loading, error, notice, showProject, active=true, onRetry, undoDelete, onPurge, ...actions }: Props) {
  const [purging,setPurging]=useState<LibraryClip|null>(null);
  useClipTrashExpiry(entries,onRetry,active);
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
    <ClipCard key={`${entry.project.id}:${entry.clip.id}`} entry={entry} workspace={workspaces.get(entry.project.id)!} now={now} showProject={showProject} {...actions} onPurge={onPurge?setPurging:undefined}/>);

  return <section className="clip-library" aria-label="Clipes">
    <header className="clip-library__toolbar">
      <h2>{loading ? "Carregando clipes…" : `${visible.length} ${visible.length === 1 ? "clipe" : "clipes"}`}</h2>
      <div>
        <AppSelect aria-label="Filtrar clipes" value={filter} onChange={event => setFilter(event.target.value as LibraryFilter)}>
          <option value="active">Ativos</option><option value="all">Todos</option><option value="deleted">Lixeira</option>
        </AppSelect>
        <AppSelect aria-label="Ordenar clipes" value={sort} onChange={event => setSort(event.target.value)}>
          {showProject && <option value="project">Por projeto</option>}
          <option value="recent">Mais recentes</option><option value="score">Maior nota</option><option value="duration">Menor duração</option><option value="time">Ordem do vídeo</option>
        </AppSelect>
      </div>
    </header>
    {filter==="deleted"&&<p className="flow-muted">Clipes ficam na lixeira por 7 dias. Depois desse prazo, são excluídos permanentemente. Se o aplicativo estiver fechado, a limpeza acontece na próxima abertura da biblioteca.</p>}
    {notice && <p role="status">{notice}{undoDelete && <button type="button" className="flow-button" onClick={undoDelete.onUndo}>Desfazer</button>}</p>}
    {loading && <p role="status">Carregando clipes…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="flow-button" onClick={onRetry}>Tentar novamente</button></div>}
    {!loading && !error && !visible.length && <div className="lib__empty"><h3>{entries.length ? "Nenhum clipe neste filtro" : "Nenhum clipe ainda"}</h3><p>{entries.length ? "Escolha outro filtro para ver seus clipes." : "Abra um projeto para criar um clipe da montagem ou gerar cortes."}</p></div>}
    {showProject ? <div className="clip-project-groups">{groups.map(group =>
      <ClipProjectGroup key={group.project.id} name={group.project.name} count={group.entries.length}>
        {cards(group.entries)}
      </ClipProjectGroup>)}</div>
      : <div className="clip-gallery">{cards(visible)}</div>}
    {purging&&onPurge&&<ClipPurgeDialog title={purging.clip.title} onConfirm={()=>onPurge(purging)} onClose={()=>setPurging(null)}/>}
  </section>;
}
