import { useEffect, useRef, useState } from "react";
import { FlowDialog } from "../workspace/FlowDialog";
import { VideoPreview } from "../workspace/VideoPreview";
import { PlaybackControls } from "../editor/PlaybackControls";
import { ProcessingDialog } from "../workspace/ProcessingDialog";
import { useClipMedia } from "../../hooks/useClipMedia";
import { readWorkspace } from "../../services/workspace-store";
import { useClips } from "../../hooks/useClips";
import { captionCue } from "../../lib/captions";
import { clipMessage, isolatedClipSettings, type Clip } from "../../lib/clips";
import type { LibraryClip } from "../../lib/clip-library";
import "./clip-library.css";
import { ClipDetails } from "./ClipDetails";
import { effectiveSegments, planDuration, snapSeek, toOutputTime, toSourceTime, segmentIndexAt } from "../../lib/edit-plan";
import { SavedClipInspection } from "./SavedClipInspection";

interface Props { entry: LibraryClip; onClose: () => void; onEdit: (projectId: string, clip: Clip) => void; onChanged?: (notice?: string) => void }
export function ClipInspection({ entry,onClose,onEdit,onChanged }: Props) {
  return entry.composition ? <SavedClipInspection entry={entry} onClose={onClose} onEdit={onEdit} onChanged={onChanged} /> : <LegacyClipInspection entry={entry} onClose={onClose} onEdit={onEdit} onChanged={onChanged} />;
}
function LegacyClipInspection({ entry,onClose,onEdit,onChanged }: Props) {
  const media = useClipMedia(entry.project.id,entry.mediaId);
  const preferences = readWorkspace(entry.project.id).clipEdits?.[entry.clip.id];
  const controller = useClips(entry.project.id,entry.mediaId);
  const clip = controller.collection?.clips.find(item => item.id === entry.clip.id) ?? entry.clip;
  const video = useRef<HTMLVideoElement>(null);
  const [time,setTime] = useState(clip.start);
  const [playing,setPlaying] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const [dismissed,setDismissed] = useState<string | null>(null);
  const settings = isolatedClipSettings(clip,preferences,media.source?.media);
  // upd 20 (auditoria): limites EFETIVOS = intervalo editado salvo (dentro do
  // clipe); prévia, controles, transcrição e download usam os MESMOS limites
  const windows = effectiveSegments(settings, media.source?.media.duration ?? clip.end);
  const from = windows[0].sourceStart;
  const to = windows[windows.length - 1].sourceEnd;
  const duration = planDuration(windows);
  const activeWindow = windows[Math.max(0, segmentIndexAt(windows, Math.min(time, to - 0.001)))];
  const allTranscript = media.source?.transcript ?? [];
  const transcript = allTranscript.filter(segment => windows.some(window => segment.start < window.sourceEnd && segment.end > window.sourceStart));
  const ownAnalysis = controller.ownedJob && controller.operation === "analyze";
  function seek(value: number) { const bounded=snapSeek(windows, Math.max(from,Math.min(value,to))); if (video.current) video.current.currentTime=bounded; setTime(bounded); }
  function toggle() {
    const player = video.current;
    if (!player) return;
    if (player.paused) {
      if (player.currentTime >= to || player.currentTime < from) seek(from);
      void player.play().then(() => setPlaying(true)).catch(() => setError("Não foi possível reproduzir este vídeo. Reabra o projeto e tente novamente."));
    } else { player.pause(); setPlaying(false); }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (controller.busy || !target.closest(".clip-inspection") || event.code !== "Space" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || target.closest("button,input,textarea,select,[contenteditable=true]")) return;
      event.preventDefault(); toggle();
    };
    document.addEventListener("keydown",key);
    return () => document.removeEventListener("keydown",key);
  });
  async function remove() {
    if (await controller.remove(clip.id)) {
      onChanged?.("Clipe excluído.");
      onClose();
    }
  }
  return <>
    <FlowDialog open title={entry.project.name} className="clip-inspection" onClose={() => {
      if (controller.busy && ownAnalysis) void controller.cancel();
      onClose();
    }} busy={controller.busy && controller.ownedJob} allowCloseWhileBusy={ownAnalysis}>
      <div className="clip-inspection__body">
        <div className="clip-inspection__player"><VideoPreview media={media.source?.media ?? null} localUrl={media.source?.url ?? null} settings={settings} videoRef={video}
          nativeControls={false} onTogglePlay={toggle} cue={captionCue(transcript,Math.min(time,to-0.001),undefined,{start:activeWindow.sourceStart,end:activeWindow.sourceEnd})} onDuration={() => seek(from)}
          onTime={value => {
            if (value >= to) { video.current?.pause(); setPlaying(false); setTime(to); }
            else if (value < from) seek(from);
            else if (segmentIndexAt(windows, value) < 0) seek(value);
            else setTime(value);
          }}/>
          <PlaybackControls time={toOutputTime(windows, time)} start={from} end={to} duration={duration}
            playing={playing} enabled={Boolean(media.source)} onSeek={seek} onToggle={toggle}/>
          <label className="sr-only" htmlFor="clip-inspection-seek">Posição no clipe</label>
          <input id="clip-inspection-seek" type="range" min={0} max={duration} step={.05} value={toOutputTime(windows, time)} onChange={event => seek(toSourceTime(windows, Number(event.target.value)))}/>
        </div>
        <ClipDetails clip={clip} transcript={transcript} time={time} from={from} to={to} loading={media.loading || controller.loading} analyzing={controller.busy && ownAnalysis}
          error={ownAnalysis && controller.job?.state === "failed" ? clipMessage(controller.job.error) : null} onSeek={seek}
          onAnalyze={() => void controller.analyze(clip.id).then(() => onChanged?.())}/>
        <div className="clip-inspection__actions"><button type="button" className="upload-primary" disabled={controller.busy} onClick={() => onEdit(entry.project.id,clip)}>Editar clipe</button>
          <button type="button" className="flow-button dialog-action--secondary" disabled={controller.busy} onClick={() => void controller.exportVideo(settings,clip.id)}>Baixar vídeo</button>
          <button type="button" className="flow-button dialog-action--danger" disabled={controller.busy} onClick={() => void remove()}>Excluir clipe</button>
          {(error || controller.error || media.error) && <p role="alert">{error ?? controller.error ?? media.error}</p>}{controller.notice && <p role="status">{controller.notice}</p>}
        </div>
      </div>
    </FlowDialog>
    {controller.ownedJob && controller.operation === "export" && controller.job && <ProcessingDialog key={controller.job.jobId} id={controller.job.jobId} open={controller.busy || (controller.job.state === "failed" && dismissed !== controller.job.jobId)} busy={controller.busy}
      title="Exportando…" status="Preparando seu vídeo" progress={controller.job.progress} error={clipMessage(controller.job.error)} cancelAction="Cancelar exportação"
      cancelDescription="A exportação será interrompida. Seu clipe salvo será mantido." onCancel={controller.cancel} onClose={() => setDismissed(controller.job!.jobId)} onRetry={() => void controller.exportVideo(settings,clip.id)}/>}
  </>;
}
