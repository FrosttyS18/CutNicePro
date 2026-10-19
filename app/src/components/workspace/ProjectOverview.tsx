import { useRef, useState } from "react";
import type { ProjectMeta } from "../../lib/types";
import type { WorkspaceData } from "../../lib/workspace-types";
import type { ToolId } from "../upload/tools";
import { ProjectTitle } from "./ProjectTitle";
import { VideoPreview } from "./VideoPreview";
import { TranscriptPanel } from "./TranscriptPanel";

interface Props {
  project: ProjectMeta;
  data: WorkspaceData;
  localUrl: string | null;
  onRename: (name: string) => Promise<void>;
  onChange: (data: WorkspaceData) => void;
  onEditor: (tool: ToolId) => void;
  onExport: () => void;
}

export function ProjectOverview({ project, data, localUrl, onRename, onChange, onEditor, onExport }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  return (
    <section className="project-overview" data-testid="project-overview">
      <ProjectTitle title={project.name} onRename={onRename} />
      <div className="project-overview__layout"><div>
        <VideoPreview media={data.media} localUrl={localUrl} settings={data.settings} videoRef={video} onTime={setTime} />
        {data.media && <p className="project-source-label">{data.media.name}<span>{data.media.kind === "local" ? "Arquivo local" : "Referência do YouTube"}</span></p>}
        <TranscriptPanel segments={data.transcript} demo={data.transcriptMode === "demo"} currentTime={time}
          canSeek={Boolean(localUrl && data.media?.duration)} onSeek={(value) => { if (video.current) { video.current.currentTime = value; setTime(value); } }}
          onText={(id, text) => onChange({ ...data, transcript: data.transcript.map((segment) => segment.id === id ? { ...segment, text } : segment) })} />
      </div><aside className="project-actions" aria-label="Ações do projeto">
        <h2>Seu vídeo</h2><button className="upload-primary" type="button" onClick={() => onEditor("editor")}>Editar vídeo</button>
        <button className="flow-button" type="button" onClick={() => onEditor("captions")}>Legendas</button>
        <button className="flow-button" type="button" onClick={() => onEditor("reframe")}>Enquadramento</button>
        <button className="flow-button" type="button" onClick={onExport}>Exportar</button>
        <div className="project-engine-note"><p>Transcrição e exportação serão habilitadas com o motor de vídeo e IA.</p></div>
      </aside></div>
    </section>
  );
}
