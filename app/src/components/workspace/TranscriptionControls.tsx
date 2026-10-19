import type { useTranscription } from "../../hooks/useTranscription";
import { useState } from "react";
import { TranscriptionDialog } from "./TranscriptionDialog";
import { transcriptionMessage } from "../../lib/transcription-feedback";
import "./transcription.css";
import { TextAlignLeftIcon } from "@phosphor-icons/react/dist/csr/TextAlignLeft";
import { TranscriptionSetup } from "./TranscriptionSetup";
import type { TranscriptionProfile } from "../../lib/transcription";

interface Props {
  controller: ReturnType<typeof useTranscription>;
  generated: boolean;
  dirty: boolean;
  onSave?: () => Promise<boolean>;
  disabled?: boolean;
}

export function TranscriptionControls({ controller: c, generated, dirty, onSave, disabled = false }: Props) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [choosing,setChoosing] = useState(false);
  const [profile,setProfile] = useState<TranscriptionProfile>("turbo");
  const [cpuOnly,setCpuOnly] = useState(false);
  async function start() {
    setPreparing(true);
    try { if (!dirty || (onSave && await onSave())) { setChoosing(false); await c.start(profile,cpuOnly ? "cpu" : "auto"); } }
    finally { setPreparing(false); }
  }
  const failed = c.job?.state === "failed";
  const open = c.busy || Boolean(failed && dismissed !== c.job?.jobId);
  return <div className="transcription-controls" aria-busy={c.busy}>
    <div className="transcription-controls__actions">
      <button type="button" className="flow-button" disabled={disabled || c.busy || !c.ready || preparing} onClick={() => {
        if (c.profiles && !c.profiles.some(option => option.id === profile && option.available)) setProfile(c.profiles.find(option => option.available)?.id ?? "turbo");
        setChoosing(true);
      }}>
        <TextAlignLeftIcon size={18} aria-hidden="true"/>{c.busy ? "Transcrevendo…" : !c.loaded ? "Preparando…" : generated ? "Transcrever novamente" : "Transcrever"}</button>
      {c.loaded && !c.ready && !c.busy && <button type="button" className="flow-button" onClick={c.retry}>Verificar novamente</button>}
    </div>
    {!open && (c.error || failed) && <p className="upload-message upload-message--error" role="alert">{c.error || transcriptionMessage(c.job?.error)}</p>}
    <TranscriptionSetup open={choosing} busy={preparing} profile={profile} cpuOnly={cpuOnly} profiles={c.profiles ?? [{id:"turbo",available:true}]}
      onProfile={setProfile} onCpu={setCpuOnly} onClose={() => setChoosing(false)} onStart={() => void start()}/>
    {c.job && <TranscriptionDialog key={c.job.jobId} open={open} job={c.job} onClose={() => setDismissed(c.job?.jobId ?? null)}
      onCancel={c.cancel} onRetry={() => { setDismissed(c.job?.jobId ?? null); setChoosing(true); }} />}
  </div>;
}
