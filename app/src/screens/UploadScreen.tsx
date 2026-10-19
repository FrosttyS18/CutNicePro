import { useEffect, useRef, useState, type DragEvent } from "react";
import type { ProjectMeta } from "../lib/types";
import { useVideoSource } from "../hooks/useVideoSource";
import { SourceForm } from "../components/upload/SourceForm";
import { ToolCards } from "../components/upload/ToolCards";
import { ToolDialog } from "../components/upload/ToolDialog";
import { PreparationDialog } from "../components/upload/PreparationDialog";
import { RecentProjects } from "../components/upload/RecentProjects";
import { videoTools, type ToolId, type AspectRatio } from "../components/upload/tools";
import { youtubeVideoId } from "../lib/video-source";
import type { UploadSource, UploadOptions } from "../lib/workspace-types";
import "./upload.css";

interface Props {
  projects: ProjectMeta[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  onCreate: (source: UploadSource, options: UploadOptions) => Promise<void>;
}

export function UploadScreen(props: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const source = useVideoSource();
  const [tool, setTool] = useState<ToolId | null>(null);
  const [model, setModel] = useState(1);
  const [ratio, setRatio] = useState<AspectRatio>("16:9");
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [youtube, setYoutube] = useState<string | null>(null);
  const [pending, setPending] = useState<{ source: UploadSource; options: UploadOptions } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const selectedTool = videoTools.find((value) => value.id === tool) ?? null;

  function selectFile(file: File) {
    setDropError(null);
    void source.select(file).then((video) => {
      if (!video) return;
      setYoutube(null);
      if (!tool) void importVideo({ kind: "local", video }, { tool: "editor", model: 0, ratio: "16:9" });
    });
  }

  function selectYouTube(url: string) {
    setYoutube(url); source.clearError();
    const videoId = youtubeVideoId(url);
    if (!tool && videoId) void importVideo({ kind: "youtube", url, videoId }, { tool: "editor", model: 0, ratio: "16:9" });
  }

  async function importVideo(selected: UploadSource, options: UploadOptions) {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setPending({ source: selected, options }); setCreating(true); setCreateError(null); setTool(null);
    try { await props.onCreate(selected, options); }
    catch (error) { setCreateError(error instanceof Error ? error.message : String(error)); }
    finally { creatingRef.current = false; setCreating(false); }
  }

  function continueFlow() {
    if (!tool) return;
    const videoId = youtube ? youtubeVideoId(youtube) : null;
    const selected: UploadSource | null = youtube && videoId ? { kind: "youtube", url: youtube, videoId }
      : source.video ? { kind: "local", video: source.video } : null;
    if (!selected) return;
    void importVideo(selected, { tool, model, ratio });
  }

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (!event.dataTransfer.files.length) return;
    if (event.dataTransfer.files.length > 1) { setDropError("Envie um vídeo por vez nesta tela."); return; }
    selectFile(event.dataTransfer.files[0]);
  }

  return (
    <section className={dragging ? "upload-screen upload-screen--dragging" : "upload-screen"}
      data-testid="upload-screen" aria-labelledby="upload-heading"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); }
      }} onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }} onDrop={drop}>
      <h1 ref={heading} id="upload-heading" className="upload-sr-only" tabIndex={-1}>Enviar novo projeto</h1>
      <div className="upload-screen__source"><SourceForm loading={source.loading} onFile={selectFile} onYouTube={selectYouTube} /></div>
      {source.error && !tool && <p className="upload-message upload-message--error" role="alert">{source.error}</p>}
      {dropError && <p className="upload-message upload-message--error" role="alert">{dropError}</p>}
      {dragging && <p className="upload-drop-label">Solte seu vídeo aqui</p>}
      <ToolCards onSelect={setTool} />
      <RecentProjects {...props} />
      <ToolDialog tool={selectedTool} video={youtube ? null : source.video} youtube={youtube} onYouTube={selectYouTube} onContinue={continueFlow}
        loading={source.loading} error={source.error}
        model={model} ratio={ratio} onModel={setModel} onRatio={setRatio} onFile={selectFile}
        onClose={() => { setTool(null); source.clearError(); }} />
      <PreparationDialog open={Boolean(pending)} busy={creating} error={createError}
        name={pending?.source.kind === "local" ? pending.source.video.file.name : "Vídeo do YouTube"}
        onClose={() => setPending(null)}
        onRetry={() => { if (pending) void importVideo(pending.source, pending.options); }} />
    </section>
  );
}
