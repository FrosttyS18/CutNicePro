import { useEffect, useRef, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import type { ExportReceipt } from "../../lib/composition-export";
import { revealEditorExport } from "../../lib/ipc";
import { FlowDialog } from "../workspace/FlowDialog";
import "./composition-export.css";

interface Props { receipt: ExportReceipt; onClose: () => void }

function sizeLabel(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024)));
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(bytes / 1024 ** index)} ${units[index]}`;
}

function ExportFinishedContent({ receipt, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const separator = Math.max(receipt.path.lastIndexOf("/"), receipt.path.lastIndexOf("\\"));
  const filename = receipt.path.slice(separator + 1);
  const directory = receipt.path.slice(0, separator + 1);
  async function reveal() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await revealEditorExport(receipt.id); }
    catch { if (active.current) setError("Não foi possível abrir a pasta. Tente novamente ou abra o caminho abaixo."); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <FlowDialog open title="Vídeo exportado" className="composition-export-finished" onClose={onClose}>
    <div className="composition-export-finished__content"><CheckCircleIcon size={36} weight="fill" aria-hidden="true"/><p className="composition-export-finished__filename">{filename}</p><p className="composition-export-finished__size">{sizeLabel(receipt.bytes)}</p><p className="composition-export-finished__path">{directory}</p>{error && <p className="composition-export__error" role="alert">{error}</p>}</div>
    <div className="composition-export__actions"><button type="button" className="flow-button dialog-action--secondary" disabled={busy} onClick={() => void reveal()}><FolderOpenIcon size={18} aria-hidden="true"/>{busy ? "Abrindo…" : "Abrir pasta"}</button><button type="button" className="flow-button dialog-action--primary" onClick={onClose}>Fechar</button></div>
  </FlowDialog>;
}

export function CompositionExportFinished(props: Props) {
  return <ExportFinishedContent key={props.receipt.id} {...props}/>;
}
