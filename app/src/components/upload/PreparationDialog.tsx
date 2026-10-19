import { FlowDialog } from "../workspace/FlowDialog";

interface Props {
  open: boolean;
  busy: boolean;
  name: string;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}

export function PreparationDialog({ open, busy, name, error, onClose, onRetry }: Props) {
  return (
    <FlowDialog open={open} title={error ? "Não foi possível importar" : "Importando vídeo"} onClose={onClose} busy={busy}>
      <div className="import-progress" aria-busy={busy}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>
        <p>{name}</p>
        {busy && <><progress aria-label="Importando vídeo" /><p className="flow-muted" role="status">Abrindo seu vídeo no projeto…</p></>}
      </div>
      {error && <><p className="upload-message upload-message--error" role="alert">{error}</p>
        <button type="button" className="upload-primary flow-wide" onClick={onRetry}>Tentar novamente</button></>}
    </FlowDialog>
  );
}
