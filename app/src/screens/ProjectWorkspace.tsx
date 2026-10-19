import { useState } from "react";
import type { ProjectMeta } from "../lib/types";
import { useWorkspaceData } from "../hooks/useWorkspaceData";
import { ProjectOverview } from "../components/workspace/ProjectOverview";
import { VideoEditor } from "../components/editor/VideoEditor";
import { ExportDialog } from "../components/workspace/ExportDialog";
import { SourceForm } from "../components/upload/SourceForm";
import type { ToolId } from "../components/upload/tools";
import "./workspace.css";

interface Props {
  project: ProjectMeta;
  initialView?: "overview" | "editor";
  onRename: (name: string) => Promise<void>;
  onImport: () => void;
}

export function ProjectWorkspace({ project, initialView = "overview", onRename, onImport }: Props) {
  const workspace = useWorkspaceData(project.id);
  const [view, setView] = useState(initialView);
  const [exporting, setExporting] = useState(false);
  function openEditor(tool: ToolId) {
    workspace.change({ ...workspace.data, tool });
    setView("editor");
  }
  return (
    <div className={view === "editor" ? "project-workspace project-workspace--editing" : "project-workspace"}>
      {view === "overview" ? <>
        {workspace.data.media ? <ProjectOverview project={project} data={workspace.data} localUrl={workspace.localUrl} onRename={onRename}
          onChange={workspace.change} onEditor={openEditor} onExport={() => setExporting(true)} />
          : <section className="project-without-media"><h1>{project.name}</h1><p>Este registro antigo não tem um vídeo importado.</p>
            <button type="button" className="upload-primary" onClick={onImport}>Importar vídeo</button></section>}
        {workspace.data.media?.kind === "local" && !workspace.localUrl && <details className="project-reconnect" open>
          <summary>Reconectar arquivo original</summary>
          <p className="flow-muted">Arquivos ficam disponíveis nesta sessão. Após reiniciar, reconecte o vídeo para continuar a prévia.</p>
          <SourceForm compact loading={workspace.source.loading} onFile={(file) => void workspace.selectFile(file)} />
          {workspace.source.error && <p className="upload-message upload-message--error" role="alert">{workspace.source.error}</p>}
        </details>}
        {workspace.dirty && <button type="button" className="upload-primary workspace-save" onClick={workspace.save}>Salvar alterações do projeto</button>}
      </> : <VideoEditor key={workspace.data.tool} title={project.name} data={workspace.data} localUrl={workspace.localUrl} dirty={workspace.dirty}
        onChange={workspace.change} onSave={workspace.save} onBack={() => setView("overview")} onExport={() => setExporting(true)} />}
      {workspace.notice && <p className={workspace.notice.error ? "workspace-notice workspace-notice--error" : "workspace-notice"}
        role={workspace.notice.error ? "alert" : "status"}>{workspace.notice.text}</p>}
      <ExportDialog open={exporting} onClose={() => setExporting(false)} />
    </div>
  );
}
