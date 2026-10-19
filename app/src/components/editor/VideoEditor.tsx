import { useEffect, useRef, useState, type ReactNode } from "react";
import { clampTime } from "../../lib/workspace";
import { editTranscriptSegment } from "../../lib/transcript-text";
import { captionCue, captionPresets, effectiveCaptionStyle } from "../../lib/captions";
import type { EditorSettings, WorkspaceData } from "../../lib/workspace-types";
import { VideoPreview } from "../workspace/VideoPreview";
import { TranscriptPanel } from "../workspace/TranscriptPanel";
import { EditorTimeline } from "./EditorTimeline";
import { EditorInspector, panelForTool } from "./EditorInspector";
import { CaptionPresetsDialog } from "./CaptionPresetsDialog";
import { usePlaybackShortcut } from "../../hooks/usePlaybackShortcut";
import { FramingToolbar } from "./FramingToolbar";

interface Props {
  title: string;
  data: WorkspaceData;
  localUrl: string | null;
  dirty: boolean;
  onChange: (data: WorkspaceData) => void;
  onSave: () => void;
  onBack: () => void;
  transcriptionControls?: ReactNode;
  transcribing?: boolean;
}

export function VideoEditor({ title, data, localUrl, dirty, onChange, onSave, onBack, transcriptionControls, transcribing }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(data.media?.duration ?? null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState(panelForTool(data.tool));
  const [captionsOpen, setCaptionsOpen] = useState(data.tool === "captions");
  const canPlay = Boolean(localUrl);
  const changeSettings = (settings: Partial<EditorSettings>) => onChange({ ...data, settings: { ...data.settings, ...settings } });
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    element.addEventListener("play", play); element.addEventListener("pause", pause);
    return () => { element.removeEventListener("play", play); element.removeEventListener("pause", pause); };
  }, [localUrl]);

  function seek(value: number) {
    if (!video.current || !duration) return;
    const next = clampTime(value, duration);
    video.current.currentTime = next;
    setTime(next);
  }

  function togglePlay() {
    const element=video.current;
    if(!element) return;
    if(element.paused) {
      if(element.currentTime<data.settings.trimStart || (data.settings.trimEnd!==null && element.currentTime>=data.settings.trimEnd)) seek(data.settings.trimStart);
      void element.play().catch(()=>setError("Não foi possível iniciar a reprodução. Tente novamente."));
    } else element.pause();
  }
  usePlaybackShortcut(canPlay && !transcribing,togglePlay);
  const cue = captionCue(data.transcript,time);
  return (
    <section className="video-editor" data-testid="video-editor" aria-label="Editor de vídeo">
      <header className="editor-header"><button type="button" className="flow-button" onClick={onBack}>Voltar ao projeto</button>
        <h1>{title}</h1>
        <button type="button" className="flow-button" disabled={!dirty} onClick={onSave}>Salvar alterações</button>
        </header>
      <div className="editor-layout">
        <TranscriptPanel segments={data.transcript} demo={data.transcriptMode === "demo"} currentTime={time} canSeek={canPlay && Boolean(duration)} generated={data.transcriptMode === "real"} readOnly={transcribing}
          onSeek={seek} onText={(id, text, words) => onChange({ ...data, transcript: data.transcript.map((segment) => segment.id === id ? { ...editTranscriptSegment(segment,text), words } : segment) })} />
        <div className="editor-stage"><FramingToolbar settings={data.settings} onSettings={changeSettings} onFrame={() => { setPanel("reframe"); changeSettings({ fit: "cover" }); }}/>
          <div className="editor-stage__canvas"><VideoPreview media={data.media} localUrl={localUrl} settings={data.settings} videoRef={video} cue={cue} nativeControls={false} onTogglePlay={togglePlay}
            onDuration={value => { setDuration(value); if (video.current && video.current.currentTime < data.settings.trimStart) { video.current.currentTime = data.settings.trimStart; setTime(data.settings.trimStart); } }} onTime={(value) => {
              setTime(value);
              if (data.settings.trimEnd !== null && value >= data.settings.trimEnd && video.current && !video.current.paused) video.current.pause();
            }} /></div>
          {data.media?.kind === "youtube" && <p className="flow-muted">Importe o arquivo do vídeo para editar.</p>}
          {!localUrl && data.media?.kind !== "youtube" && <p className="flow-muted">Volte ao projeto para conectar o arquivo de vídeo.</p>}
          {error && <p className="upload-message upload-message--error" role="alert">{error}</p>}
        </div>
        <EditorInspector panel={panel} settings={data.settings} onPanel={setPanel} onSettings={changeSettings}
          onCaptions={() => setCaptionsOpen(true)} tools={transcriptionControls} />
      </div>
      <EditorTimeline mediaId={data.media?.mediaId} localUrl={localUrl} duration={duration} time={time} playing={playing} canPlay={canPlay} settings={data.settings} onSeek={seek}
        onSettings={changeSettings} onTogglePlay={togglePlay} />
      <CaptionPresetsDialog open={captionsOpen} model={data.settings.captionModel} style={data.settings.captionStyle}
        onModel={(captionModel) => changeSettings({ captionModel, captionStyle:{...captionPresets[captionModel].style} })}
        onStyle={change=>changeSettings({captionModel:data.settings.captionModel||1,captionStyle:{...effectiveCaptionStyle(data.settings.captionModel,data.settings.captionStyle),...change}})}
        onClose={() => setCaptionsOpen(false)} />
    </section>
  );
}
