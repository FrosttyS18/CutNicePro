import { useState } from "react";
import { TextAlignLeftIcon } from "@phosphor-icons/react/dist/csr/TextAlignLeft";
import { ClosedCaptioningIcon } from "@phosphor-icons/react/dist/csr/ClosedCaptioning";
import { AppSelect } from "../AppSelect";
import { TranscriptionSetup } from "../workspace/TranscriptionSetup";
import { TranscriptionDialog } from "../workspace/TranscriptionDialog";
import { EditorAction } from "./EditorAction";
import { useEditorTranscription } from "../../hooks/useEditorTranscription";
import { applyCaptionTranscript, hasCaptionTranscriptUpdate } from "../../lib/composition-captions";
import type { Composition } from "../../lib/composition-types";
import type { TranscriptionProfile } from "../../lib/transcription";
import "../workspace/transcription.css";

interface Props {
  projectId: string;
  document: Composition;
  preferredAssetId?: string;
  onChange: (document: Composition) => void;
  onPause: () => void;
  onError: (message: string) => void;
}

export function EditorTranscriptionControls({ projectId, document, preferredAssetId, onChange, onPause, onError }: Props) {
  const [choice, setChoice] = useState({ preferredAssetId, id: preferredAssetId });
  const desired = choice.preferredAssetId === preferredAssetId ? choice.id : preferredAssetId;
  const asset = document.assets.find(value => value.id === desired) ?? document.assets[0];
  const eligible = Boolean(asset && asset.kind !== "image" && asset.hasAudio !== false);
  const controller = useEditorTranscription(projectId, eligible ? asset?.mediaId : undefined);
  const [choosing, setChoosing] = useState(false);
  const [profile, setProfile] = useState<TranscriptionProfile>("turbo");
  const [cpuOnly, setCpuOnly] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const record = controller.record?.mediaId === asset?.mediaId ? controller.record : null;
  const canApply = Boolean(record && asset && hasCaptionTranscriptUpdate(document, asset.mediaId, record.segments));
  const failed = controller.job?.state === "failed";
  const progressOpen = controller.busy || Boolean(failed && dismissed !== controller.job?.jobId);
  const jobAsset = document.assets.find(value => value.mediaId === controller.job?.mediaId);
  const generated = Boolean(record || asset?.transcript.length);
  const choose = () => {
    if (!controller.profiles.some(option => option.id === profile && option.available)) {
      setProfile(controller.profiles.find(option => option.available)?.id ?? "turbo");
    }
    onPause(); setChoosing(true);
  };
  const apply = () => {
    if (!record || !asset || !canApply || controller.busy || !controller.recordReady) return;
    try {
      onPause();
      onChange(applyCaptionTranscript(document, asset.mediaId, record.segments));
      setNotice("Transcrição aplicada ao rascunho. Salve para confirmar.");
    } catch (error) { onError(error instanceof Error ? error.message : "Não foi possível aplicar esta transcrição."); }
  };

  return <section className="transcription-controls editor-transcription" aria-label="Transcrição da mídia" aria-busy={controller.busy || controller.recordLoading}>
    {document.assets.length > 0 && <label className="transcription-setup__label">Mídia<AppSelect name="editor-transcription-media" aria-label="Mídia para transcrever" value={asset?.id ?? ""}
      onChange={event => { setChoice({ preferredAssetId, id: event.target.value }); setNotice(""); }}>
      {document.assets.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
    </AppSelect></label>}
    {!asset ? <p className="flow-muted">Importe um vídeo ou áudio para transcrever quando precisar de legendas.</p>
      : !eligible ? <p className="flow-muted">{asset.kind === "image" ? "Imagens não têm fala para transcrever." : "Esta mídia não tem áudio para transcrever."}</p>
        : <div className="transcription-controls__actions">
          <EditorAction label={controller.busy ? "Transcrevendo…" : generated ? "Transcrever novamente" : "Transcrever"} icon={<TextAlignLeftIcon size={17} aria-hidden="true"/>}
            disabled={!controller.ready || controller.busy} onClick={choose}/>
          {!controller.loaded && <span className="flow-muted" role="status">Verificando transcrição…</span>}
          {controller.loaded && controller.recordLoading && <span className="flow-muted" role="status">Carregando transcrição…</span>}
          {controller.loaded && !controller.ready && <button type="button" className="flow-button" disabled={controller.busy} onClick={controller.retry}>Verificar novamente</button>}
        </div>}
    {controller.job?.state === "running" && <p className="flow-muted" role="status">Transcrevendo: {jobAsset?.name ?? "mídia removida da montagem"}</p>}
    {record && record.segments.length === 0 && <p className="flow-muted" role="status">Nenhuma fala encontrada nesta mídia. Você pode continuar editando.</p>}
    {canApply && <EditorAction label="Aplicar transcrição" icon={<ClosedCaptioningIcon size={17} aria-hidden="true"/>} disabled={controller.busy || !controller.recordReady} onClick={apply}/>}
    {record && !canApply && record.segments.length > 0 && <p className="flow-muted">A transcrição desta mídia já está disponível para edição.</p>}
    {notice && <p className="flow-muted" role="status">{notice}</p>}
    {controller.job?.state === "cancelled" && <p className="flow-muted" role="status">Transcrição cancelada. O resultado anterior foi mantido.</p>}
    {controller.error && !progressOpen && <p className="upload-message upload-message--error" role="alert">{controller.error}</p>}
    <TranscriptionSetup open={choosing} busy={controller.busy} profile={profile} cpuOnly={cpuOnly} profiles={controller.profiles}
      onProfile={setProfile} onCpu={setCpuOnly} onClose={() => setChoosing(false)} onStart={() => { setChoosing(false); setNotice(""); void controller.start(profile, cpuOnly ? "cpu" : "auto"); }}/>
    {controller.job && <TranscriptionDialog key={controller.job.jobId} open={progressOpen} job={controller.job}
      onClose={() => setDismissed(controller.job?.jobId ?? null)} onCancel={controller.cancel}
      onRetry={() => { setDismissed(controller.job?.jobId ?? null); choose(); }} />}
  </section>;
}
