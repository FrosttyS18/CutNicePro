import { useEffect, useRef, useState } from "react";
import { ProcessingDialog } from "../workspace/ProcessingDialog";
import { useClipMedia } from "../../hooks/useClipMedia";
import { readWorkspace } from "../../services/workspace-store";
import { useClips } from "../../hooks/useClips";
import { clipMessage, isolatedClipSettings } from "../../lib/clips";
import type { LibraryClip } from "../../lib/clip-library";

interface Props { entry: LibraryClip; onClose: () => void; onChanged?: (notice?: string) => void }

/**
 * Executa o download (exportação) de um clipe a partir do CARD da galeria.
 * Atualização 20 (auditoria): o resultado é tipado — "Vídeo exportado" só
 * aparece quando o arquivo foi EFETIVAMENTE publicado; cancelamento do
 * diálogo de destino e do processamento são silenciosos; falha mantém o
 * executor visível com repetição; mídia indisponível NÃO inicia exportação
 * e não deixa o executor invisível ou preso.
 */
export function ClipDownload({ entry,onClose,onChanged }: Props) {
  const media = useClipMedia(entry.project.id,entry.mediaId);
  const controller = useClips(entry.project.id,entry.mediaId);
  const [dismissed,setDismissed] = useState<string | null>(null);
  const [failure,setFailure] = useState<string | null>(null);
  const started = useRef(false);
  const preferences = readWorkspace(entry.project.id).clipEdits?.[entry.clip.id];
  const settings = isolatedClipSettings(entry.clip,preferences,media.source?.media);
  // dispara UMA vez, com a mídia resolvida; mídia em falha nunca inicia
  useEffect(() => {
    if (started.current || media.loading || media.error) return;
    started.current = true;
    void (async () => {
      const result = await controller.exportVideo(settings,entry.clip.id);
      if (result.status === "completed") { onChanged?.("Vídeo exportado."); onClose(); return; }
      if (result.status === "dialog-cancelled" || result.status === "cancelled" || result.status === "abandoned") {
        onChanged?.(); onClose(); return;
      }
      if (result.status === "failed") { setFailure(clipMessage(result.error)); return; }
      setFailure("Há um processamento em andamento. Aguarde ou cancele antes de baixar este clipe.");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.loading, media.error]);
  const job = controller.job;
  return <>
    {media.error && <div className="clip-download__problem" role="alert">
      <p>Não foi possível carregar este clipe. Reconecte o vídeo original e tente novamente.</p>
      <button type="button" className="flow-button" onClick={onClose}>Fechar</button>
    </div>}
    {!media.error && failure && <div className="clip-download__problem" role="alert">
      <p>{failure}</p>
      <button type="button" className="flow-button" onClick={onClose}>Fechar</button>
    </div>}
    {!media.error && !failure && controller.ownedJob && controller.operation === "export" && job && <ProcessingDialog key={job.jobId} id={job.jobId}
      open={controller.busy || (job.state === "failed" && dismissed !== job.jobId)} busy={controller.busy}
      title="Baixando clipe…" status="Preparando seu vídeo" progress={job.progress} error={clipMessage(job.error)}
      cancelAction="Cancelar download" cancelDescription="A exportação será interrompida. Seu clipe salvo será mantido."
      onCancel={controller.cancel} onRetry={() => void controller.exportVideo(settings,entry.clip.id)} onClose={() => { setDismissed(job.jobId); onClose(); }}/>}
  </>;
}
