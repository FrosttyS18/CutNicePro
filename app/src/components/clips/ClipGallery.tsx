import { useState } from "react";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { AppSelect } from "../AppSelect";
import { ClipPoster } from "./ClipPoster";
import { visibleClips, type LibraryClip, type LibraryFilter } from "../../lib/clip-library";
import "./clip-library.css";

interface Props { entries: LibraryClip[]; loading?: boolean; error?: string | null; notice?: string | null; showProject?: boolean;
  onInspect: (entry: LibraryClip) => void; onRetry?: () => void;
  onEdit?: (entry: LibraryClip) => void; onDownload?: (entry: LibraryClip) => void; onDelete?: (entry: LibraryClip) => void;
  onRestore?: (entry: LibraryClip) => void;
  undoDelete?: { onUndo: () => void } | null }

export function ClipGallery({ entries,loading,error,notice,showProject,onInspect,onRetry,onEdit,onDownload,onDelete,onRestore,undoDelete }: Props) {
  const [filter,setFilter] = useState<LibraryFilter>("active");
  const [sort,setSort] = useState("score");
  const visible = visibleClips(entries,filter,sort);
  return <section className="clip-library" aria-label="Clipes">
    <header className="clip-library__toolbar"><h2>{loading ? "Carregando clipes…" : `${visible.length} ${visible.length === 1 ? "clipe" : "clipes"}`}</h2><div>
      <AppSelect aria-label="Filtrar clipes" value={filter} onChange={event => setFilter(event.target.value as LibraryFilter)}><option value="active">Ativos</option><option value="all">Todos</option><option value="pending">Para revisar</option><option value="approved">Aprovados</option><option value="rejected">Rejeitados</option><option value="deleted">Excluídos</option></AppSelect>
      <AppSelect aria-label="Ordenar clipes" value={sort} onChange={event => setSort(event.target.value)}><option value="score">Maior nota</option><option value="duration">Menor duração</option><option value="time">Ordem do vídeo</option></AppSelect>
    </div></header>
    {notice && <p role="status">{notice}{undoDelete && <button type="button" className="flow-button" onClick={undoDelete.onUndo}>Desfazer</button>}</p>}
    {loading && <p role="status">Carregando clipes…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="flow-button" onClick={onRetry}>Tentar novamente</button></div>}
    {!loading && !error && !visible.length && <div className="lib__empty"><h3>{entries.length ? "Nenhum clipe neste filtro" : "Nenhum clipe ainda"}</h3><p>{entries.length ? "Escolha outro filtro para ver seus clipes." : "Abra um projeto e escolha Gerar cortes para começar."}</p></div>}
    <div className="clip-gallery">{visible.map(entry => <article className="clip-card" key={`${entry.project.id}:${entry.clip.id}`} data-review={entry.clip.review} data-deleted={entry.clip.deleted ? "true" : undefined}>
      <button type="button" className="clip-card__open" onClick={() => onInspect(entry)} aria-label={`Ver clipe: ${entry.clip.title}`} aria-haspopup="dialog">
        <ClipPoster entry={entry}/><span className="clip-card__play"><PlayIcon size={22} weight="fill" aria-hidden="true"/></span>
      </button>
      <div className="clip-card__meta">
        {/* upd 20: a nota só aparece com análise VÁLIDA; desatualizada,
            com falha ou ausente têm rótulo próprio — nunca nota como concluída */}
        {entry.clip.analysisError ? <span>Análise pendente</span>
          : entry.clip.analysisStale ? <span>Análise desatualizada</span>
          : entry.clip.analysis ? <strong aria-label={`Nota estimada: ${entry.clip.score} de 100`}>{entry.clip.score}<small>/100</small></strong>
          : <span>Sem análise</span>}
        {entry.clip.deleted ? <span>Excluído</span> : <span>{entry.clip.review === "approved" ? "Aprovado" : entry.clip.review === "rejected" ? "Rejeitado" : "Para revisar"}</span>}
      </div>
      <button type="button" className="clip-card__title" onClick={() => onInspect(entry)}>{entry.clip.title}</button>
      {showProject && <p className="clip-card__project">{entry.project.name}</p>}
      {(onEdit || onDownload || onDelete || onRestore) && <div className="clip-card__actions" role="group" aria-label={`Ações do clipe: ${entry.clip.title}`}>
        {onEdit && entry.clip.deleted !== true && <button type="button" className="flow-button" onClick={() => onEdit(entry)}><PencilSimpleIcon size={16} aria-hidden="true"/>Editar</button>}
        {onDownload && entry.clip.deleted !== true && <button type="button" className="flow-button" onClick={() => onDownload(entry)}><DownloadSimpleIcon size={16} aria-hidden="true"/>Baixar</button>}
        {entry.clip.deleted === true
          ? onRestore && <button type="button" className="flow-button" onClick={() => onRestore(entry)}>Restaurar</button>
          : onDelete && <button type="button" className="flow-button" onClick={() => onDelete(entry)}><TrashIcon size={16} aria-hidden="true"/>Excluir</button>}
      </div>}
    </article>)}</div>
  </section>;
}
