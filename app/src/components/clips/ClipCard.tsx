import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { ClipPoster } from "./ClipPoster";
import { isClipNew, relativeTime } from "../../lib/clips";
import type { LibraryClip } from "../../lib/clip-library";
import type { WorkspaceData } from "../../lib/workspace-types";

export interface ClipCardActions {
  onInspect: (entry: LibraryClip) => void;
  onEdit?: (entry: LibraryClip) => void;
  onDownload?: (entry: LibraryClip) => void;
  onDelete?: (entry: LibraryClip) => void;
  onRestore?: (entry: LibraryClip) => void;
}
interface Props extends ClipCardActions { entry: LibraryClip; workspace: WorkspaceData; now: number; showProject?: boolean }

export function ClipCard({ entry, workspace, now, showProject, onInspect, onEdit, onDownload, onDelete, onRestore }: Props) {
  const { clip } = entry;
  return <article className="clip-card" data-review={clip.review} data-deleted={clip.deleted ? "true" : undefined}>
    <button type="button" className="clip-card__open" onClick={() => onInspect(entry)} aria-label={`Ver clipe: ${clip.title}`} aria-haspopup="dialog">
      <ClipPoster entry={entry} workspace={workspace} />
      <span className="clip-card__play"><PlayIcon size={22} weight="fill" aria-hidden="true" /></span>
      {isClipNew(clip, now) && <span className="clip-card__new" aria-label="Novo clipe">Novo</span>}
      {clip.createdAtMs !== undefined && <span className="clip-card__when" aria-label={`Criado em ${new Date(clip.createdAtMs).toLocaleString()}`}>{relativeTime(clip.createdAtMs, now)}</span>}
    </button>
    <div className="clip-card__meta">
      {clip.origin === "manual" ? <span>Manual</span>
        : clip.manuallyEdited ? <span>Editado manualmente</span>
        : clip.analysisError ? <span>Análise pendente</span>
        : clip.analysisStale ? <span>Análise desatualizada</span>
        : clip.analysis ? <strong aria-label={`Nota estimada: ${clip.score} de 100`}>{clip.score}<small>/100</small></strong>
        : <span>Sem análise</span>}
      {clip.deleted ? <span>Excluído</span> : <span>{clip.review === "approved" ? "Aprovado" : clip.review === "rejected" ? "Rejeitado" : "Para revisar"}</span>}
    </div>
    <button type="button" className="clip-card__title" onClick={() => onInspect(entry)}>{clip.title}</button>
    {showProject && <p className="clip-card__project">{entry.project.name}</p>}
    {(onEdit || onDownload || onDelete || onRestore) && <div className="clip-card__actions" role="group" aria-label={`Ações do clipe: ${clip.title}`}>
      {onEdit && !clip.deleted && <button type="button" className="flow-button" onClick={() => onEdit(entry)}><PencilSimpleIcon size={16} aria-hidden="true" />Editar</button>}
      {onDownload && !clip.deleted && <button type="button" className="flow-button" onClick={() => onDownload(entry)}><DownloadSimpleIcon size={16} aria-hidden="true" />Baixar</button>}
      {clip.deleted
        ? onRestore && <button type="button" className="flow-button" onClick={() => onRestore(entry)}>Restaurar</button>
        : onDelete && <button type="button" className="flow-button" onClick={() => onDelete(entry)}><TrashIcon size={16} aria-hidden="true" />Excluir</button>}
    </div>}
  </article>;
}
