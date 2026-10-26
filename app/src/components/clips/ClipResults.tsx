import { AppSelect } from "../AppSelect";
import { useState } from "react";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { formatPlaybackTime } from "../../lib/playback";
import type { Clip, ClipReview } from "../../lib/clips";
import "./clips.css";

interface Props { clips: Clip[]; busy: boolean; onOpen: (clip: Clip) => void; onExport: (clip: Clip) => void; onReview: (id: string, review: ClipReview) => Promise<void> }
export function ClipResults({ clips, busy, onOpen, onExport, onReview }: Props) {
  const [filter, setFilter] = useState<"all" | ClipReview>("all");
  const [sort, setSort] = useState("score");
  const [saving, setSaving] = useState<string | null>(null);
  const visible = clips.filter(clip => filter === "all" || clip.review === filter).sort((a,b) => sort === "score" ? (b.score ?? -1)-(a.score ?? -1) : sort === "duration" ? (a.end-a.start)-(b.end-b.start) : a.start-b.start);
  async function review(clip: Clip, next: ClipReview) {
    setSaving(clip.id);
    try { await onReview(clip.id, clip.review === next ? "pending" : next); } finally { setSaving(null); }
  }
  return <section className="clip-results" aria-label="Cortes sugeridos">
    <header><h2>Cortes sugeridos <span>({clips.length})</span></h2><div>
      <AppSelect aria-label="Filtrar cortes" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">Todos</option><option value="approved">Aprovados</option><option value="pending">Para revisar</option><option value="rejected">Rejeitados</option></AppSelect>
      <AppSelect aria-label="Ordenar cortes" value={sort} onChange={event => setSort(event.target.value)}><option value="score">Maior nota</option><option value="duration">Menor duração</option><option value="time">Ordem do vídeo</option></AppSelect></div></header>
    <p className="flow-muted">Potencial estimado. Aprove os cortes que deseja exportar.</p>
    {!visible.length && <p>{clips.length ? "Nenhum corte neste filtro." : "Não encontramos trechos com a duração escolhida. Experimente uma duração menor."}</p>}
    <ol className="clip-list">{visible.map(clip => <li key={clip.id} data-review={clip.review}>
      <div className="clip-score" aria-label={clip.score === null ? clip.origin === "manual" ? "Manual" : "Editado manualmente" : `Potencial estimado: ${clip.score} de 100`}>
        {clip.score === null ? <strong>{clip.origin === "manual" ? "Manual" : "Editado manualmente"}</strong> : <><strong>{clip.score}</strong><span>/100</span></>}
      </div>
      <div className="clip-details"><h3>{clip.title}</h3><p>{formatPlaybackTime(clip.start)} — {formatPlaybackTime(clip.end)} · {Math.round(clip.end-clip.start)} s</p>
        <ul>{clip.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        <div className="clip-actions"><button type="button" className="flow-button" disabled={busy} onClick={() => onOpen(clip)}><PlayIcon size={16} aria-hidden="true"/>Ver e editar</button>
          <button type="button" className="flow-button" disabled={busy || clip.review !== "approved"} title={clip.review !== "approved" ? "Aprove o corte para exportar" : undefined} onClick={() => onExport(clip)}><DownloadSimpleIcon size={16} aria-hidden="true"/>Exportar</button>
          <button type="button" className="flow-button" disabled={busy || saving !== null} aria-pressed={clip.review === "approved"} onClick={() => void review(clip,"approved")}><CheckIcon size={16} aria-hidden="true"/>Aprovar</button>
          <button type="button" className="flow-button" disabled={busy || saving !== null} aria-pressed={clip.review === "rejected"} onClick={() => void review(clip,"rejected")}><XIcon size={16} aria-hidden="true"/>Rejeitar</button></div>
      </div>
    </li>)}</ol>
  </section>;
}
