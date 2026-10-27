import { useEffect, useRef, useState } from "react";
import { FlowDialog } from "./FlowDialog";
import { useMeasuredProgress } from "../../hooks/useMeasuredProgress";
import { useEditorTooltip } from "../../hooks/useEditorTooltip";
import "./transcription.css";
import "../editor/editor-controls.css";
import { cancelStep, type CancelState } from "../../lib/cancel-flow";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";

interface Props {
  open: boolean; id: string; busy: boolean; title: string; status: string; progress: number; error: string;
  cancelDescription: string; onClose: () => void; onCancel: () => Promise<boolean>; onRetry: () => void;
  progressLabel?: string;
  cancelAction: string;
}
export function ProcessingDialog({ open, id, busy, title, status, progress: measured, error, cancelDescription, onClose, onCancel, onRetry, progressLabel, cancelAction }: Props) {
  const progress = useMeasuredProgress(id, measured);
  const [motionPaused, setMotionPaused] = useState(false);
  const motionAnchor = useRef<HTMLButtonElement>(null);
  const motionTooltip = useEditorTooltip(motionAnchor, motionPaused ? "Retomar animação" : "Pausar animação");
  const { hide: hideMotionTooltip } = motionTooltip;
  useEffect(() => { hideMotionTooltip(); }, [open, busy, id, hideMotionTooltip]);
  const [cancelState, setCancelState] = useState<CancelState>("running");
  const confirming = cancelState !== "running";
  const cancelling = cancelState === "cancelling";
  function close() { motionTooltip.hide(); if (busy) setCancelState(value => cancelStep(value,"request")); else onClose(); }
  async function cancel() {
    const next = cancelStep(cancelState,"confirm");
    if (next !== "cancelling") return;
    setCancelState(next);
    try { if (!await onCancel()) setCancelState("error"); }
    catch { setCancelState("error"); }
  }
  return <FlowDialog open={open} title={busy ? confirming ? `${cancelAction}?` : title : "Não foi possível concluir"}
    onClose={close} busy={busy} allowCloseWhileBusy className={`transcription-dialog${motionPaused ? " animation-paused" : ""}`}>
    {busy && confirming ? <div className="transcription-confirm">
      <p>{cancelDescription}</p>
      {cancelState === "error" && <p role="alert">Não foi possível cancelar. Tente novamente.</p>}
      <div className="transcription-confirm__actions"><button type="button" className="upload-primary" disabled={cancelling} onClick={() => setCancelState("running")} autoFocus>Continuar</button>
        <button type="button" className="flow-button dialog-action--secondary" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? "Cancelando…" : cancelAction}</button></div>
    </div> : busy ? <>
      <div className="transcription-progress" aria-busy="true"><div className="thinking-orb" aria-hidden="true"><i/><i/><i/></div>
        <button ref={motionAnchor} type="button" className="thinking-motion-toggle" aria-label={motionPaused ? "Retomar animação" : "Pausar animação"} aria-describedby={motionTooltip.descriptionId} {...motionTooltip.trigger}
          onClick={() => { motionTooltip.hide(); setMotionPaused(value => !value); }}>{motionPaused ? <PlayIcon size={16} aria-hidden="true"/> : <PauseIcon size={16} aria-hidden="true"/>}</button>
        {motionTooltip.portal}
        <strong className="transcription-progress__number" aria-hidden="true">{progress}%</strong><p role="status">{status}</p>
        <p className="flow-muted">Mantenha o aplicativo aberto até concluir.</p><progress aria-label={progressLabel ?? title} value={progress} max={100}/></div>
      <button type="button" className="upload-primary flow-wide processing-cancel" onClick={() => { motionTooltip.hide(); setCancelState("confirming"); }}>Cancelar</button>
    </> : <><p className="upload-message upload-message--error" role="alert">{error}</p><button type="button" className="upload-primary flow-wide" onClick={onRetry}>Tentar novamente</button></>}
  </FlowDialog>;
}
