import { useEffect, useState } from "react";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import type { MediaKind } from "../../lib/composition-types";
import { useMediaRelink } from "../../hooks/useMediaRelink";
import { EditorAction } from "../editor/EditorAction";
import { getMedia, type MediaEntryDto } from "../../lib/ipc";
import { canRelinkMedia } from "../../lib/media-availability";
import "./media-relink.css";

export function RelinkMediaControl({ projectId, mediaId, kind, knownEntry }: { projectId: string; mediaId: string; kind: MediaKind; knownEntry?: MediaEntryDto | null }) {
  const relink = useMediaRelink(projectId, mediaId, kind);
  const [resolved,setResolved] = useState<{ key: string; entry: MediaEntryDto | null; error: boolean } | null>(null);
  const key = `${projectId}:${mediaId}`;
  useEffect(() => {
    if (knownEntry !== undefined) return;
    let active = true;
    void getMedia(mediaId).then(entry => { if(active)setResolved({ key, entry, error:false }); })
      .catch(() => { if(active)setResolved({ key, entry:null, error:true }); });
    return () => { active=false; };
  },[mediaId,key,knownEntry]);
  const record = knownEntry !== undefined ? knownEntry : resolved?.key === key ? resolved.entry : undefined;
  if (knownEntry === undefined && resolved?.key === key && resolved.error) return <p className="flow-muted" role="status">Não foi possível verificar o vínculo deste arquivo. Reabra o projeto para tentar novamente.</p>;
  if (!record || record.mediaId !== mediaId || !canRelinkMedia(record)) return null;
  return <div className="media-relink" aria-busy={relink.busy}>
    <div className="media-relink__actions">
      <EditorAction label={relink.busy ? "Verificando original…" : "Localizar arquivo original"} icon={<FolderOpenIcon size={16} aria-hidden="true"/>}
        disabled={relink.busy} onClick={() => { void relink.locate(); }}/>
      {relink.busy && <EditorAction compact label="Cancelar verificação do original" icon={<XIcon size={16} aria-hidden="true"/>} onClick={relink.cancel}/>}
    </div>
    {relink.progress && <progress className="media-relink__progress" aria-label="Verificando arquivo original" max={relink.progress.total || 1} value={relink.progress.completed}/>}
    {relink.notice && <p className={relink.notice.error ? "upload-message upload-message--error" : "flow-muted"} role={relink.notice.error ? "alert" : "status"}>{relink.notice.text}</p>}
  </div>;
}
