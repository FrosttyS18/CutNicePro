import { useEffect, useState } from "react";
import { readPreparation } from "../../services/project-preparation-state";

function message(projectId: string, mediaId?: string): string | null {
  try {
    const record = readPreparation(projectId);
    if (!record || record.mediaId !== mediaId) return null;
    if (record.state === "running") return "A preparação deste projeto ainda não tem um resultado confirmado. Você pode continuar editando e verificar a transcrição nos controles do projeto.";
    return record.message ?? "A preparação não terminou. Seu vídeo foi mantido. Use Transcrever para tentar novamente, ou continue editando.";
  } catch {
    return "Não foi possível ler o registro de preparação. Seu vídeo e projeto foram mantidos. Você pode editar ou usar os controles de transcrição para tentar novamente.";
  }
}
export function PreparationRecoveryNotice({ projectId, mediaId, busy }: { projectId: string; mediaId?: string; busy: boolean }) {
  const [text, setText] = useState(() => message(projectId, mediaId));
  useEffect(() => {
    const update = () => setText(message(projectId, mediaId));
    update();
    window.addEventListener("cnp:preparation-changed", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("cnp:preparation-changed", update); window.removeEventListener("storage", update); };
  }, [projectId, mediaId]);
  return text && !busy ? <div className="workspace-notice" role="status"><p>{text}</p></div> : null;
}
