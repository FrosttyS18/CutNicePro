import { useRef, useState, type ReactNode } from "react";
import type { ProjectMeta } from "../../lib/types";
import type { WorkspaceData } from "../../lib/workspace-types";
import type { ToolId } from "../upload/tools";
import { ProjectTitle } from "./ProjectTitle";
import { VideoPreview } from "./VideoPreview";
import { TranscriptPanel } from "./TranscriptPanel";
import { editTranscriptSegment } from "../../lib/transcript-text";
import { ProjectDeleteButton } from "./ProjectDeleteButton";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { ClosedCaptioningIcon } from "@phosphor-icons/react/dist/csr/ClosedCaptioning";
import { CropIcon } from "@phosphor-icons/react/dist/csr/Crop";

interface Props {
  project: ProjectMeta;
  data: WorkspaceData;
  localUrl: string | null;
  onRename: (name: string) => Promise<void>;
  onChange: (data: WorkspaceData) => void;
  onEditor: (tool: ToolId) => void;
  onDelete: () => Promise<void>;
  transcriptionControls?: ReactNode;
  transcribing?: boolean;
  mediaReconnect?: ReactNode;
}

export function ProjectOverview({ project, data, localUrl, onRename, onChange, onEditor, onDelete, transcriptionControls, transcribing, mediaReconnect }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  return (
    <section className="project-overview" data-testid="project-overview">
      <ProjectTitle title={project.name} onRename={onRename} />
      <div className="project-overview__layout"><div>
        <VideoPreview original media={data.media} localUrl={localUrl} settings={data.settings} videoRef={video} onTime={setTime} />
        {data.media && <p className="project-source-label">{data.media.name}<span>{data.media.kind === "local" ? "Arquivo local" : "Referência do YouTube"}</span></p>}
        <TranscriptPanel segments={data.transcript} demo={data.transcriptMode === "demo"} currentTime={time} generated={data.transcriptMode === "real"} readOnly={transcribing}
          canSeek={Boolean(localUrl && data.media?.duration)} onSeek={(value) => { if (video.current) { video.current.currentTime = value; setTime(value); } }}
          onText={(id, text, words) => onChange({ ...data, transcript: data.transcript.map((segment) => segment.id === id ? { ...editTranscriptSegment(segment,text), words } : segment) })} />
      </div><aside className="project-actions" aria-label="Ações do projeto">
        <h2>Ferramentas</h2><button className="upload-primary" type="button" onClick={() => onEditor("editor")}><FilmStripIcon size={18} aria-hidden="true"/>Editar vídeo</button>
        {transcriptionControls}
        <button className="flow-button" type="button" onClick={() => onEditor("captions")}><ClosedCaptioningIcon size={18} aria-hidden="true"/>Legendas</button>
        <button className="flow-button" type="button" onClick={() => onEditor("reframe")}><CropIcon size={18} aria-hidden="true"/>Enquadramento</button>
        {mediaReconnect}
        <ProjectDeleteButton name={project.name} onDelete={onDelete} disabled={transcribing} />
      </aside></div>
    </section>
  );
}
