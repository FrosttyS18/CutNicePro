import { lazy, Suspense, useRef, useState } from "react";
import type { ProjectMeta } from "../lib/types";
import { useWorkspaceData } from "../hooks/useWorkspaceData";
import { RelinkMediaControl } from "../components/workspace/RelinkMediaControl";
import { useTranscription } from "../hooks/useTranscription";
import { TranscriptionControls } from "../components/workspace/TranscriptionControls";
import { ProjectOverview } from "../components/workspace/ProjectOverview";
import { SourceForm } from "../components/upload/SourceForm";
import { ProjectDeleteButton } from "../components/workspace/ProjectDeleteButton";
import type { ToolId } from "../components/upload/tools";
import "./workspace.css";
import "./editor-refinement.css";
import { useClips } from "../hooks/useClips";
import { ClipTools } from "../components/clips/ClipTools";
import { ClipFeedback } from "../components/clips/ClipFeedback";
import { ClipDownload } from "../components/clips/ClipDownload";
import { type Clip } from "../lib/clips";
import { fullVideoWorkspace, openClipWorkspace } from "../lib/clip-workspace";
import { ClipGallery } from "../components/clips/ClipGallery";
import { ClipInspection } from "../components/clips/ClipInspection";
import type { LibraryClip } from "../lib/clip-library";
import { PreparationRecoveryNotice } from "../components/workspace/PreparationRecoveryNotice";
import type { ProjectEditorOrigin } from "../lib/project-navigation";
import { useViewScroll } from "../hooks/useViewScroll";
import { EditorLoading, EditorOpenBoundary } from "../components/editor/EditorOpening";

const VideoEditor=lazy(()=>import("../components/editor/VideoEditor").then(module=>({default:module.VideoEditor})));

interface Props {
  project: ProjectMeta;
  initialView?: "overview" | "editor";
  initialEditorOrigin?: ProjectEditorOrigin;
  onReturnToLibrary?: () => void;
  onRename: (name: string) => Promise<void>;
  onImport: () => void;
  onDelete: () => Promise<void>;
}

export function ProjectWorkspace({ project, initialView = "overview", initialEditorOrigin="overview", onReturnToLibrary, onRename, onImport, onDelete }: Props) {
  const workspace = useWorkspaceData(project.id);
  const transcription = useTranscription(project.id, workspace.data.media?.mediaId, workspace.acceptTranscript);
  const clips = useClips(project.id, workspace.data.media?.mediaId);
  const transcriptionControls = workspace.data.media?.mediaId
    ? <TranscriptionControls controller={transcription} generated={workspace.data.transcriptMode === "real"} dirty={workspace.dirty} onSave={workspace.save} disabled={clips.busy} /> : undefined;
  const [view, setView] = useState<"overview" | "editor" | "clips">(initialView);
  const [editorOrigin,setEditorOrigin]=useState<ProjectEditorOrigin>(initialEditorOrigin);
  const clipPane=useRef<HTMLDivElement>(null);
  const rememberClipScroll=useViewScroll(clipPane,view==="clips");
  const [previousInitialView, setPreviousInitialView] = useState(initialView);
  if (initialView !== previousInitialView) {
    setPreviousInitialView(initialView);
    if (initialView === "editor") { setView("editor"); setEditorOrigin(initialEditorOrigin); }
  }
  const [inspecting,setInspecting] = useState<LibraryClip | null>(null);
  const [clipNotice,setClipNotice] = useState<string | null>(null);
  const [downloading,setDownloading] = useState<LibraryClip | null>(null);
  const [undoDelete,setUndoDelete] = useState<{ clipId: string } | null>(null);
  const activeClip = view === "editor" ? workspace.data.activeClipId : undefined;
  function openClip(clip: Clip) {
    rememberClipScroll();
    setEditorOrigin(view==="clips"?"clips":"overview");
    workspace.change(clips.snapshots?.[clip.id] ? { ...workspace.data, activeClipId: clip.id, tool: "editor" } : openClipWorkspace(workspace.data,clip));
    setView("editor");
  }
  const clipTools = workspace.data.media?.mediaId ? <ClipTools controller={clips} settings={view === "editor" ? workspace.data.settings : fullVideoWorkspace(workspace.data).settings} libraryView={view === "clips"}
    ready={workspace.data.transcriptMode === "real" && workspace.data.transcript.length > 0} disabled={transcription.busy}
    onSave={workspace.save} onShowClips={() => setView("clips")} activeClipId={activeClip} activeClip={clips.collection?.clips.find(clip => clip.id === activeClip)}
    onFullVideo={() => workspace.change(fullVideoWorkspace(workspace.data))}/> : undefined;
  function openEditor(tool: ToolId) {
    setEditorOrigin("overview");
    workspace.change({ ...fullVideoWorkspace(workspace.data), tool });
    setView("editor");
  }
  function leaveEditor() {
    if ((editorOrigin === "library" || editorOrigin === "editor") && onReturnToLibrary) onReturnToLibrary();
    else setView(editorOrigin === "clips" ? "clips" : "overview");
  }
  const editorBackLabel = editorOrigin === "editor" ? "Voltar aos projetos" : editorOrigin === "library" && onReturnToLibrary ? "Voltar à biblioteca" : editorOrigin === "clips" ? "Voltar aos clipes" : "Voltar ao projeto";
  return (
    <div className={view === "editor" ? "project-workspace project-workspace--editing" : "project-workspace"}>
      {view === "overview" ? <>
        <PreparationRecoveryNotice projectId={project.id} mediaId={workspace.data.media?.mediaId} busy={transcription.busy} />
        {workspace.data.media?.kind === "youtube" && <div className="workspace-notice" role="status">
          Este projeto contém apenas uma referência do YouTube. O vídeo não foi importado para edição.
          <button type="button" className="flow-button" onClick={onImport}>Importar arquivo do computador</button>
        </div>}
        {workspace.data.media ? <ProjectOverview project={project} data={workspace.data} localUrl={workspace.localUrl} onRename={onRename}
          onChange={workspace.change} onEditor={openEditor} onDelete={onDelete} transcriptionControls={<>{transcriptionControls}{clipTools}</>} transcribing={transcription.busy || clips.busy}
          mediaReconnect={workspace.data.media?.kind === "local" && workspace.data.media.mediaId && workspace.canRelink
            ? <RelinkMediaControl key={workspace.data.media.mediaId} projectId={project.id} mediaId={workspace.data.media.mediaId} kind="video" knownEntry={workspace.mediaEntry}/> : undefined} />
          : <section className="project-without-media"><h1>{project.name}</h1><p>Este projeto não tem um vídeo.</p>
            <button type="button" className="upload-primary" onClick={onImport}>Importar vídeo</button>
            <ProjectDeleteButton name={project.name} onDelete={onDelete} disabled={transcription.busy} /></section>}
        {workspace.data.media?.kind === "local" && !workspace.data.media.mediaId && !workspace.localUrl && <details className="project-reconnect" open>
          <summary>Reconectar arquivo original</summary>
          <p className="flow-muted">Escolha o arquivo original para abrir este vídeo.</p>
          <SourceForm compact loading={workspace.source.loading} onFile={(file) => void workspace.selectFile(file)} />
          {workspace.source.error && <p className="upload-message upload-message--error" role="alert">{workspace.source.error}</p>}
        </details>}
        {workspace.dirty && <button type="button" className="upload-primary workspace-save" onClick={workspace.save}>Salvar alterações do projeto</button>}
      </> : null}
      {(view === "clips" || view === "editor" && editorOrigin === "clips") && <div ref={clipPane} hidden={view!=="clips"} inert={view!=="clips"}>
        <header className="project-clips__heading"><div><button type="button" className="flow-button" onClick={() => setView("overview")}>Voltar ao projeto</button><h1>{project.name}</h1></div><div className="project-clips__tools">{clipTools}</div></header>
        <ClipGallery active={view==="clips"&&!clips.busy} entries={(clips.collection?.clips ?? []).map(clip => ({project,mediaId: clips.collection!.mediaId,clip, composition: clips.snapshots?.[clip.id]}))} loading={clips.loading} error={clips.error} notice={clipNotice}
          onRetry={clips.reload} onInspect={setInspecting}
          onEdit={entry => { openClip(entry.clip); }}
          onDownload={entry => setDownloading(entry)}
          onDelete={entry => { void clips.remove(entry.clip.id).then(ok => { if (ok) { setClipNotice("Clipe movido para a lixeira por 7 dias."); setUndoDelete({ clipId: entry.clip.id }); } }); }}
          onPurge={async entry=>{await clips.purge(entry.clip.id);setUndoDelete(null);setClipNotice("Clipe excluído permanentemente.");}}
          onRestore={entry => { void clips.restore(entry.clip.id).then(ok => { if (ok) { setClipNotice("Clipe restaurado."); setUndoDelete(null); } }); }}
          undoDelete={undoDelete ? { onUndo: () => { const clipId = undoDelete.clipId; void clips.restore(clipId).then(ok => { if (ok) { setClipNotice("Clipe restaurado."); setUndoDelete(null); } }); } } : null}/>
      </div>}
      {view === "editor" && <EditorOpenBoundary key={`${workspace.data.tool}:${activeClip ?? "video"}`} onBack={leaveEditor} backLabel={editorBackLabel}>
        <Suspense fallback={<EditorLoading onBack={leaveEditor} backLabel={editorBackLabel} />}><VideoEditor projectId={project.id} title={project.name} activeClip={activeClip ? clips.collection?.clips.find(clip => clip.id === activeClip) : undefined} data={workspace.data} localUrl={workspace.localUrl} dirty={workspace.dirty}
          onChange={workspace.change} onSave={workspace.save} onBack={leaveEditor} transcribing={transcription.busy || clips.busy}
          allClips={clips.collection?.clips} onShowClips={()=>{clips.reload();setView("clips");}} /></Suspense>
      </EditorOpenBoundary>}
      <ClipFeedback job={clips.job} ownedJob={clips.ownedJob} notice={clips.notice}/>
      {workspace.notice && <p className={workspace.notice.error ? "workspace-notice workspace-notice--error" : "workspace-notice"}
        role={workspace.notice.error ? "alert" : "status"}>{workspace.notice.text}</p>}
      {inspecting && <ClipInspection entry={inspecting} onClose={() => setInspecting(null)} onChanged={notice=>{setClipNotice(notice ?? null);clips.reload();}}
        onEdit={(_,clip) => { setInspecting(null); openClip(clip); }}/>}
      {downloading && <ClipDownload entry={downloading} onClose={() => setDownloading(null)} onChanged={() => setClipNotice("Vídeo exportado.")}/>}
    </div>
  );
}
