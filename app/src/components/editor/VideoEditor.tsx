import { useEffect, useRef, useState } from "react";
import { clampTime } from "../../lib/workspace";
import type { EditorSettings, WorkspaceData } from "../../lib/workspace-types";
import { VideoPreview } from "../workspace/VideoPreview";
import { TranscriptPanel } from "../workspace/TranscriptPanel";
import { EditorTimeline } from "./EditorTimeline";
import { EditorInspector, panelForTool } from "./EditorInspector";
import { CaptionPresetsDialog } from "./CaptionPresetsDialog";

interface Props {
  title: string;
  data: WorkspaceData;
  localUrl: string | null;
  dirty: boolean;
  onChange: (data: WorkspaceData) => void;
  onSave: () => void;
  onBack: () => void;
  onExport: () => void;
}

export function VideoEditor({ title, data, localUrl, dirty, onChange, onSave, onBack, onExport }: Props) {
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

  const currentCaption = data.transcript.find((segment) => time >= segment.start && time < segment.end)?.text ?? "";
  return (
    <section className="video-editor" data-testid="video-editor" aria-label="Editor de vídeo">
      <header className="editor-header"><button type="button" className="flow-button" onClick={onBack}>Voltar ao projeto</button>
        <h1>{title}</h1><span className="flow-demo-label">Prévia de edição</span>
        <button type="button" className="flow-button" disabled={!dirty} onClick={onSave}>Salvar alterações</button>
        <button type="button" className="upload-primary" onClick={onExport}>Exportar</button></header>
      <div className="editor-layout">
        <TranscriptPanel segments={data.transcript} demo={data.transcriptMode === "demo"} currentTime={time} canSeek={canPlay && Boolean(duration)}
          onSeek={seek} onText={(id, text) => onChange({ ...data, transcript: data.transcript.map((segment) => segment.id === id ? { ...segment, text } : segment) })} />
        <div className="editor-stage"><div className="editor-stage__meta"><span>{data.settings.ratio}</span><span>Layout: {data.settings.fit === "cover" ? "Preencher" : "Ajustar"}</span></div>
          <div className="editor-stage__canvas"><VideoPreview media={data.media} localUrl={localUrl} settings={data.settings} videoRef={video} caption={data.settings.captionModel ? currentCaption : ""}
            onDuration={setDuration} onTime={(value) => {
              setTime(value);
              if (data.settings.trimEnd !== null && value >= data.settings.trimEnd && video.current && !video.current.paused) video.current.pause();
            }} /></div>
          {data.media?.kind === "youtube" && <p className="flow-muted">Referência do YouTube. Para playback integrado e linha do tempo, use um arquivo local.</p>}
          {!localUrl && data.media?.kind !== "youtube" && <p className="flow-muted">Volte ao projeto para conectar o arquivo de vídeo.</p>}
          {error && <p className="upload-message upload-message--error" role="alert">{error}</p>}
        </div>
        <EditorInspector panel={panel} settings={data.settings} onPanel={setPanel} onSettings={changeSettings}
          onCaptions={() => setCaptionsOpen(true)} />
      </div>
      <EditorTimeline localUrl={localUrl} duration={duration} time={time} playing={playing} canPlay={canPlay} settings={data.settings} onSeek={seek}
        onSettings={changeSettings} onTogglePlay={() => {
          if (!video.current) return;
          if (video.current.paused) {
            if (time < data.settings.trimStart || (data.settings.trimEnd !== null && time >= data.settings.trimEnd)) seek(data.settings.trimStart);
            void video.current.play().catch(() => setError("Não foi possível iniciar a reprodução. Tente os controles do vídeo."));
          } else video.current.pause();
        }} />
      <CaptionPresetsDialog open={captionsOpen} model={data.settings.captionModel} onModel={(captionModel) => changeSettings({ captionModel })}
        onClose={() => setCaptionsOpen(false)} />
    </section>
  );
}
