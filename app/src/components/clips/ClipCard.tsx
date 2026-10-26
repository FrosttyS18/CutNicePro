import { useRef } from "react";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { ScissorsIcon } from "@phosphor-icons/react/dist/csr/Scissors";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { ClipPoster } from "./ClipPoster";
import { EditorAction } from "../editor/EditorAction";
import { clipChangedAt, isClipNew, relativeTime } from "../../lib/clips";
import { clipTrashRemaining } from "../../lib/clip-trash";
import type { LibraryClip } from "../../lib/clip-library";
import type { WorkspaceData } from "../../lib/workspace-types";
import { useEditorTooltip } from "../../hooks/useEditorTooltip";

export interface ClipCardActions {
  onInspect: (entry: LibraryClip) => void;
  onEdit?: (entry: LibraryClip) => void;
  onDownload?: (entry: LibraryClip) => void;
  onDelete?: (entry: LibraryClip) => void;
  onRestore?: (entry: LibraryClip) => void;
  onPurge?: (entry: LibraryClip) => void;
}
interface Props extends ClipCardActions { entry: LibraryClip; workspace: WorkspaceData; now: number; showProject?: boolean }

export function ClipCard({ entry, workspace, now, showProject, onInspect, onEdit, onDownload, onDelete, onRestore, onPurge }: Props) {
  const { clip } = entry;
  const changedAt=clipChangedAt(clip);
  const titleRef = useRef<HTMLButtonElement>(null);
  const titleTooltip = useEditorTooltip(titleRef, clip.title, "clip-card__title-tooltip");
  return <article className="clip-card" data-review={clip.review} data-deleted={clip.deleted ? "true" : undefined}>
    <button type="button" className="clip-card__open" onClick={() => onInspect(entry)} aria-label={`Ver clipe: ${clip.title}`} aria-haspopup="dialog">
      <ClipPoster entry={entry} workspace={workspace} />
      <span className="clip-card__play"><PlayIcon size={22} weight="fill" aria-hidden="true" /></span>
      {isClipNew(clip, now) && <span className="clip-card__new" aria-label="Novo clipe">Novo</span>}
      {changedAt !== undefined && <span className="clip-card__when" aria-label={`${clip.editedAtMs===changedAt?"Editado":"Criado"} em ${new Date(changedAt).toLocaleString()}`}>{relativeTime(changedAt, now)}</span>}
    </button>
    <div className="clip-card__meta">
      {clip.manuallyEdited ? <span className="chip">Editado</span>
        : clip.origin === "manual" ? <span>Manual</span>
        : clip.analysisError ? <span>Análise pendente</span>
        : clip.analysisStale ? <span>Análise desatualizada</span>
        : clip.analysis ? <strong aria-label={`Nota estimada: ${clip.score} de 100`}>{clip.score}<small>/100</small></strong>
        : <span>Sem análise</span>}
      {clip.deleted&&<span>Na lixeira</span>}
    </div>
    <button ref={titleRef} type="button" className="clip-card__title" aria-describedby={titleTooltip.descriptionId} {...titleTooltip.trigger} onClick={() => { titleTooltip.hide(); onInspect(entry); }}>{clip.title}</button>
    {titleTooltip.portal}
    {showProject && <p className="clip-card__project">{entry.project.name}</p>}
    {clip.deleted&&<p className="flow-muted">{clipTrashRemaining(clip,now)}</p>}
    {(onEdit || onDownload || onDelete || onRestore || onPurge) && <div className="clip-card__actions" role="group" aria-label={`Ações do clipe: ${clip.title}`}>
      {onEdit && !clip.deleted && <EditorAction compact label="Editar" tooltip="Editar clipe" icon={<ScissorsIcon size={18} aria-hidden="true"/>} onClick={() => onEdit(entry)}/>}
      {onDownload && !clip.deleted && <EditorAction compact label="Baixar" tooltip="Baixar clipe" icon={<DownloadSimpleIcon size={18} aria-hidden="true"/>} onClick={() => onDownload(entry)}/>}
      {clip.deleted
        ? onRestore && <EditorAction compact label="Restaurar" tooltip="Restaurar clipe" icon={<ArrowCounterClockwiseIcon size={18} aria-hidden="true"/>} onClick={() => onRestore(entry)}/>
        : onDelete && <EditorAction compact label="Excluir" tooltip="Excluir clipe" icon={<TrashIcon size={18} aria-hidden="true"/>} onClick={() => onDelete(entry)}/>}
      {clip.deleted&&onPurge&&<EditorAction compact label="Excluir permanentemente" tooltip="Excluir permanentemente" icon={<TrashIcon size={18} aria-hidden="true"/>} onClick={()=>onPurge(entry)}/>}
    </div>}
  </article>;
}
