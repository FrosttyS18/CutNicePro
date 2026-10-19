import { useState } from "react";
import { FlowDialog } from "./FlowDialog";

interface Props { open: boolean; onClose: () => void; }

export function ExportDialog({ open, onClose }: Props) {
  const [quality, setQuality] = useState("1080p");
  return (
    <FlowDialog open={open} title="Exportar vídeo" onClose={onClose}>
      <p className="flow-demo-label">Prévia de interface</p>
      <p className="flow-muted">O renderizador será integrado na próxima etapa. Nenhum arquivo será exportado nesta versão.</p>
      <div className="export-options"><label>Formato<input readOnly value="MP4" /></label>
        <label>Resolução<select value={quality} onChange={(event) => setQuality(event.target.value)}>
          <option>720p</option><option>1080p</option><option>Original</option>
        </select></label></div>
      <button type="button" className="upload-primary flow-wide" disabled>Exportação ainda não disponível</button>
    </FlowDialog>
  );
}
