import { FlowDialog } from "../workspace/FlowDialog";
import { preparationLabels, type PreparationProgress } from "../../lib/project-preparation";

interface Props {
  open: boolean;
  busy: boolean;
  name: string;
  error: string | null;
  progress?: { copied: number; total: number } | null;
  preparation?: PreparationProgress | null;
  onCancel?: () => void;
  cancelling?: boolean;
  onClose: () => void;
  onRetry: () => void;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PreparationDialog({
  open,
  busy,
  name,
  error,
  progress = null,
  preparation = null,
  onCancel,
  cancelling = false,
  onClose,
  onRetry,
}: Props) {
  const total = progress?.total ?? 0;
  const stage = preparation?.stage ?? "importing";
  const copying = stage === "importing";
  const value = preparation ? preparation.percent === null ? null : preparation.percent / 100 : progress && total > 0 ? progress.copied / total : null;
  const label = copying && progress && total > 0
    ? `Copiando… ${formatMb(progress.copied)} de ${formatMb(total)}`
    : preparationLabels[stage];
  const transcribing = stage !== "validating" && !copying;
  return (
    <FlowDialog open={open} title={error ? "Não foi possível importar" : "Preparando projeto"} onClose={onClose} busy={busy}>
      <div className="import-progress" aria-busy={busy}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>
        <p>{name}</p>
        {busy && (
          <>
            {value !== null && <strong className="import-progress__number" aria-hidden="true">{Math.round(Math.min(1, Math.max(0, value)) * 100)}%</strong>}
            <progress
              aria-label={copying ? "Importando vídeo" : preparationLabels[stage]}
              value={value === null ? undefined : value}
              max={value === null ? undefined : 1}
            />
            <p className="flow-muted" role="status">{label}</p>
            <p className="flow-muted">{preparation?.remainingSeconds != null
              ? `Estimativa desta etapa: ${preparation.remainingSeconds < 60 ? `${preparation.remainingSeconds} s` : `${Math.ceil(preparation.remainingSeconds / 60)} min`}`
              : "Calculando estimativa"}</p>
            {transcribing && <p className="flow-muted">Seu vídeo já foi importado. Você poderá editar mesmo sem transcrição.</p>}
            {onCancel && (
              <button type="button" className="flow-button flow-wide" onClick={onCancel} disabled={cancelling}>
                {cancelling ? "Cancelando…" : transcribing ? "Cancelar transcrição" : "Cancelar importação"}
              </button>
            )}
          </>
        )}
      </div>
      {error && <><p className="upload-message upload-message--error" role="alert">{error}</p>
        <button type="button" className="upload-primary flow-wide" onClick={onRetry}>Tentar novamente</button></>}
    </FlowDialog>
  );
}
