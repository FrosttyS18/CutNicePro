import { FlowDialog } from "./FlowDialog";
import { AppSelect } from "../AppSelect";
import type { TranscriptionProfile } from "../../lib/transcription";

interface Props {
  open: boolean; busy: boolean; profile: TranscriptionProfile; cpuOnly: boolean;
  profiles: {id: TranscriptionProfile; available: boolean}[];
  onProfile: (profile: TranscriptionProfile) => void; onCpu: (value: boolean) => void;
  onClose: () => void; onStart: () => void;
}
export function TranscriptionSetup({open,busy,profile,cpuOnly,profiles,onProfile,onCpu,onClose,onStart}: Props) {
  const available = profiles.filter(option => option.available);
  return <FlowDialog open={open} className="transcription-setup" title="Transcrever" onClose={onClose} busy={busy}>
    <label className="transcription-setup__label">Modelo<AppSelect name="transcription-profile" aria-label="Modelo de transcrição" value={profile}
      onChange={event => onProfile(event.target.value as TranscriptionProfile)}>
      {available.map(option => <option key={option.id} value={option.id}>{option.id === "turbo" ? "Rápido · Large v3 Turbo" : "Completo · Large v3"}</option>)}
    </AppSelect></label>
    <p className="flow-muted">{profile === "turbo" ? "Mais leve para transcrever no dia a dia." : "Usa mais memória. A precisão pode variar com o áudio."}</p>
    <details className="transcription-setup__options"><summary>Processamento</summary>
      <label className="editor-checkbox"><input type="checkbox" name="processor-only" autoComplete="off" checked={cpuOnly} onChange={event => onCpu(event.target.checked)}/>Usar apenas o processador</label>
    </details>
    <button type="button" className="upload-primary flow-wide" disabled={busy || !available.some(option => option.id === profile)} onClick={onStart}>Transcrever</button>
  </FlowDialog>;
}
