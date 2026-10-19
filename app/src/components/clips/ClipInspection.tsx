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

interface Props { entry: LibraryClip; onClose: () => void; onEdit: (projectId: string, clip: Clip) => void; onChanged?: () => void }
export function ClipInspection({ entry,onClose,onEdit,onChanged }: Props) {
  const media = useClipMedia(entry.project.id,entry.mediaId);
  const preferences = readWorkspace(entry.project.id).clipEdits?.[entry.clip.id];
  const controller = useClips(entry.project.id,entry.mediaId);
  const clip = controller.collection?.clips.find(item => item.id === entry.clip.id) ?? entry.clip;
  const video = useRef<HTMLVideoElement>(null);
  const [time,setTime] = useState(clip.start);
  const [playing,setPlaying] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const [dismissed,setDismissed] = useState<string | null>(null);
  const attempted = useRef(false);
  const settings = isolatedClipSettings(clip,preferences,media.source?.media);
  const allTranscript = media.source?.transcript ?? [];
  const transcript = allTranscript.filter(segment => segment.start < clip.end && segment.end > clip.start);
  useEffect(() => {
    if (attempted.current || controller.loading || !controller.collection || clip.analysis || controller.busy) return;
    attempted.current = true;
    void controller.analyze(clip.id).then(() => onChanged?.());
  },[controller.loading,controller.collection,clip.analysis,controller.busy,clip.id]);
  function seek(value: number) { if (video.current) video.current.currentTime = Math.max(clip.start, Math.min(value,clip.end)); setTime(value); }
  function toggle() {
    const player = video.current;
    if (!player) return;
    if (player.paused) {
      if (player.currentTime >= clip.end || player.currentTime < clip.start) seek(clip.start);
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
  async function review(value: "approved" | "rejected") {
    await controller.review(clip.id,value); onChanged?.();
  }
  return <>
    <FlowDialog open title={entry.project.name} className="clip-inspection" onClose={() => {
      if (controller.busy && controller.job?.stage === "analyzing") void controller.cancel();
      onClose();
    }} busy={controller.busy} allowCloseWhileBusy={controller.job?.stage === "analyzing"}>
      <div className="clip-inspection__body">
        <div className="clip-inspection__player"><VideoPreview media={media.source?.media ?? null} localUrl={media.source?.url ?? null} settings={settings} videoRef={video}
          nativeControls={false} onTogglePlay={toggle} cue={captionCue(allTranscript,time)} onDuration={() => seek(clip.start)}
          onTime={value => {
            if (value >= clip.end) { video.current?.pause(); setPlaying(false); setTime(clip.end); }
            else if (value < clip.start) seek(clip.start); else setTime(value);
          }}/>
          <PlaybackControls time={Math.max(0,time-clip.start)} start={clip.start} end={clip.end} duration={clip.end-clip.start}
            playing={playing} enabled={Boolean(media.source)} onSeek={seek} onToggle={toggle}/>
          <label className="sr-only" htmlFor="clip-inspection-seek">Posição no clipe</label>
          <input id="clip-inspection-seek" type="range" min={clip.start} max={clip.end} step={.05} value={time} onChange={event => seek(Number(event.target.value))}/>
        </div>
        <ClipDetails clip={clip} transcript={transcript} time={time} loading={media.loading || controller.loading} analyzing={controller.busy && controller.job?.stage === "analyzing"}
          error={controller.job?.stage === "analyzing" && controller.job.state === "failed" ? clipMessage(controller.job.error) : null} onSeek={seek}
          onAnalyze={() => void controller.analyze(clip.id).then(() => onChanged?.())}/>
        <div className="clip-inspection__actions"><button type="button" className="upload-primary" disabled={controller.busy} onClick={() => onEdit(entry.project.id,clip)}>Editar clipe</button>
          <button type="button" className="flow-button" disabled={controller.busy || controller.loading} aria-pressed={clip.review === "approved"} onClick={() => void review("approved")}>Aprovar</button>
          <button type="button" className="flow-button" disabled={controller.busy || controller.loading} aria-pressed={clip.review === "rejected"} onClick={() => void review("rejected")}>Rejeitar</button>
          <button type="button" className="flow-button" disabled={controller.busy || clip.review !== "approved"} title={clip.review !== "approved" ? "Aprove o clipe para exportar" : undefined}
            onClick={() => void controller.exportVideo(settings,clip.id)}>Exportar vídeo</button>
          {(error || controller.error || media.error) && <p role="alert">{error ?? controller.error ?? media.error}</p>}{controller.notice && <p role="status">{controller.notice}</p>}
        </div>
      </div>
    </FlowDialog>
    {controller.job?.stage === "rendering" && <ProcessingDialog key={controller.job.jobId} id={controller.job.jobId} open={controller.busy || (controller.job.state === "failed" && dismissed !== controller.job.jobId)} busy={controller.busy}
      title="Exportando…" status="Preparando seu vídeo" progress={controller.job.progress} error={clipMessage(controller.job.error)} cancelAction="Cancelar exportação"
      cancelDescription="A exportação será interrompida. Seu clipe salvo será mantido." onCancel={controller.cancel} onClose={() => setDismissed(controller.job!.jobId)} onRetry={() => void controller.exportVideo(settings,clip.id)}/>}
  </>;
}
