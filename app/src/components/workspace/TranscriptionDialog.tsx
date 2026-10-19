import { ProcessingDialog } from "./ProcessingDialog";
import type { TranscriptionJob } from "../../lib/transcription";
import { transcriptionMessage } from "../../lib/transcription-feedback";

interface Props {
  open: boolean;
  job: TranscriptionJob;
  onClose: () => void;
  onCancel: () => Promise<boolean>;
  onRetry: () => void;
}

const stages = { extracting: "Preparando seu vídeo", transcribing: "Transcrevendo seu vídeo", saving: "Salvando sua transcrição" };

export function TranscriptionDialog({ open, job, onClose, onCancel, onRetry }: Props) {
  const busy = job.state === "running";
  return <ProcessingDialog open={open} id={job.jobId} busy={busy} title="Transcrevendo…" status={stages[job.stage]}
    progress={job.progress} progressLabel="Transcrição do vídeo" cancelAction="Cancelar transcrição" error={transcriptionMessage(job.error)}
    cancelDescription="O progresso desta transcrição será perdido. Sua transcrição anterior será mantida."
    onClose={onClose} onCancel={onCancel} onRetry={onRetry}/>;
}
