import { useState } from "react";
import { FlowDialog } from "../workspace/FlowDialog";
import { ProcessingDialog } from "../workspace/ProcessingDialog";
import { SavedCompositionPreview } from "./SavedCompositionPreview";
import { ClipDetails } from "./ClipDetails";
import { useCompositionPlayback } from "../../hooks/useCompositionPlayback";
import { useCompositionExport } from "../../hooks/useCompositionExport";
import { useClips } from "../../hooks/useClips";
import { compositionDuration } from "../../lib/composition";
import { frameToSeconds, secondsToFrame } from "../../lib/composition-time";
import { montageTranscript } from "../../lib/composition-playback";
import { clipMessage, type Clip } from "../../lib/clips";
import type { LibraryClip } from "../../lib/clip-library";

interface Props { entry: LibraryClip; onClose: () => void; onEdit: (projectId: string, clip: Clip) => void; onChanged?: (notice?: string) => void }
export function SavedClipInspection({ entry, onClose, onEdit, onChanged }: Props) {
  const clips = useClips(entry.project.id, entry.mediaId || undefined);
  const snapshot = clips.snapshots?.[entry.clip.id] ?? entry.composition!;
  const document = snapshot.document;
  const clip = clips.collection?.clips.find(value => value.id === entry.clip.id) ?? entry.clip;
  const [ready,setReady]=useState(false);
  const playback = useCompositionPlayback(document.fps, compositionDuration(document),ready);
  const exporter = useCompositionExport(entry.project.id);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const duration = frameToSeconds(compositionDuration(document), document.fps);
  async function download() {
    playback.pause();
    const result = await exporter.exportDocument(document, clip.id);
    if (result.status === "completed") { setNotice("Vídeo exportado."); onChanged?.("Vídeo exportado."); }
  }
  return <>
    <FlowDialog open title={entry.project.name} className="clip-inspection" onClose={onClose} busy={exporter.busy || clips.busy}>
      <div className="clip-inspection__body">
        <SavedCompositionPreview document={document} playback={playback} onReady={setReady}/>
        <ClipDetails clip={{ ...clip, start: 0, end: duration }} transcript={montageTranscript(document).map(value => value.segment)}
          time={frameToSeconds(playback.frame, document.fps)} from={0} to={duration} loading={clips.loading} analyzing={false}
          error={null} onSeek={seconds => playback.seek(secondsToFrame(seconds, document.fps))} onAnalyze={() => {}} />
        <div className="clip-inspection__actions">
          <button type="button" className="upload-primary" disabled={exporter.busy || clips.busy} onClick={() => onEdit(entry.project.id, clip)}>Editar clipe</button>
          <button type="button" className="flow-button dialog-action--secondary" disabled={exporter.busy || clips.busy} onClick={() => void download()}>Baixar vídeo</button>
          <button type="button" className="flow-button dialog-action--danger" disabled={exporter.busy || clips.busy} onClick={() => void clips.remove(clip.id).then(ok => { if (ok) { onChanged?.("Clipe excluído."); onClose(); } })}>Excluir clipe</button>
          {(clips.error || exporter.error) && <p role="alert">{clips.error ?? exporter.error}</p>}
          {notice && <p role="status">{notice}</p>}
        </div>
      </div>
    </FlowDialog>
    {exporter.job && <ProcessingDialog key={exporter.job.jobId} id={exporter.job.jobId} open={exporter.busy || exporter.job.state === "failed" && dismissed !== exporter.job.jobId} busy={exporter.busy}
      title="Exportando…" status="Preparando sua montagem" progress={exporter.job.progress} error={clipMessage(exporter.job.error)} cancelAction="Cancelar exportação"
      cancelDescription="A exportação será interrompida. Sua montagem salva será mantida." onCancel={exporter.cancel} onClose={() => setDismissed(exporter.job!.jobId)} onRetry={() => void download()} />}
  </>;
}
