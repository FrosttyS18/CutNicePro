import { useState } from "react";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { AppSelect } from "../AppSelect";
import { ClipPoster } from "./ClipPoster";
import { visibleClips, type LibraryClip } from "../../lib/clip-library";
import type { ClipReview } from "../../lib/clips";
import "./clip-library.css";

interface Props { entries: LibraryClip[]; loading?: boolean; error?: string | null; showProject?: boolean; onInspect: (entry: LibraryClip) => void; onRetry?: () => void }
export function ClipGallery({ entries,loading,error,showProject,onInspect,onRetry }: Props) {
  const [filter,setFilter] = useState<"all" | ClipReview>("all");
  const [sort,setSort] = useState("score");
  const visible = visibleClips(entries,filter,sort);
  return <section className="clip-library" aria-label="Clipes">
    <header className="clip-library__toolbar"><h2>{loading ? "Carregando clipes…" : `${entries.length} ${entries.length === 1 ? "clipe" : "clipes"}`}</h2><div>
      <AppSelect aria-label="Filtrar clipes" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">Todos</option><option value="pending">Para revisar</option><option value="approved">Aprovados</option><option value="rejected">Rejeitados</option></AppSelect>
      <AppSelect aria-label="Ordenar clipes" value={sort} onChange={event => setSort(event.target.value)}><option value="score">Maior nota</option><option value="duration">Menor duração</option><option value="time">Ordem do vídeo</option></AppSelect>
    </div></header>
    {loading && <p role="status">Carregando clipes…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="flow-button" onClick={onRetry}>Tentar novamente</button></div>}
    {!loading && !error && !visible.length && <div className="lib__empty"><h3>{entries.length ? "Nenhum clipe neste filtro" : "Nenhum clipe ainda"}</h3><p>{entries.length ? "Escolha outro filtro para ver seus clipes." : "Abra um projeto e escolha Gerar cortes para começar."}</p></div>}
    <div className="clip-gallery">{visible.map(entry => <article className="clip-card" key={`${entry.project.id}:${entry.clip.id}`} data-review={entry.clip.review}>
      <button type="button" className="clip-card__open" onClick={() => onInspect(entry)} aria-label={`Ver clipe: ${entry.clip.title}`} aria-haspopup="dialog">
        <ClipPoster entry={entry}/><span className="clip-card__play"><PlayIcon size={22} weight="fill" aria-hidden="true"/></span>
      </button>
      <div className="clip-card__meta"><strong aria-label={`Nota estimada: ${entry.clip.score} de 100`}>{entry.clip.score}<small>/100</small></strong><span>{entry.clip.review === "approved" ? "Aprovado" : entry.clip.review === "rejected" ? "Rejeitado" : "Para revisar"}</span></div>
      <button type="button" className="clip-card__title" onClick={() => onInspect(entry)}>{entry.clip.title}</button>
      {showProject && <p className="clip-card__project">{entry.project.name}</p>}
    </article>)}</div>
  </section>;
}
