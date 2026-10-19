import { FlowDialog } from "../workspace/FlowDialog";

interface Props {
  open: boolean;
  busy: boolean;
  name: string;
  error: string | null;
  /** M2A: progresso REAL da cópia (bytes) — null quando indeterminado. */
  progress?: { copied: number; total: number } | null;
  onCancel?: () => void;
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
  onCancel,
  onClose,
  onRetry,
}: Props) {
  const total = progress?.total ?? 0;
  const value = progress && total > 0 ? progress.copied / total : null;
  const label = progress && total > 0
    ? `Copiando… ${formatMb(progress.copied)} de ${formatMb(total)}`
    : "Abrindo seu vídeo no projeto…";
  return (
    <FlowDialog open={open} title={error ? "Não foi possível importar" : "Importando vídeo"} onClose={onClose} busy={busy}>
      <div className="import-progress" aria-busy={busy}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>
        <p>{name}</p>
        {busy && (
          <>
            {value !== null && <strong className="import-progress__number" aria-hidden="true">{Math.round(Math.min(1, Math.max(0, value)) * 100)}%</strong>}
            <progress
              aria-label="Importando vídeo"
              value={value === null ? undefined : value}
              max={value === null ? undefined : 1}
            />
            <p className="flow-muted" role="status">{label}</p>
            {onCancel && (
              <button type="button" className="flow-button flow-wide" onClick={onCancel}>
                Cancelar importação
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
