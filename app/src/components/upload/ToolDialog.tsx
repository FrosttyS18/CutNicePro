import { useEffect, useId, useRef, useState } from "react";
import type { LocalVideo } from "../../lib/video-source";
import { CaptionExamples } from "./CaptionExamples";
import { CaptionOptions } from "./CaptionOptions";
import { SourceForm } from "./SourceForm";
import { ToolIcon } from "./ToolIcon";
import type { AspectRatio, VideoTool } from "./tools";

interface Props {
  tool: VideoTool | null;
  video: LocalVideo | null;
  loading: boolean;
  error: string | null;
  model: number;
  ratio: AspectRatio;
  onModel: (index: number) => void;
  onRatio: (ratio: AspectRatio) => void;
  onFile: (file: File) => void;
  onClose: () => void;
  youtube: string | null;
  onYouTube: (url: string) => void;
  onContinue: () => void;
}

export function ToolDialog({ tool, video, youtube, loading, error, model, ratio, onModel, onRatio, onFile, onClose, onYouTube, onContinue }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => setPreviewError(false), [video?.url]);
  useEffect(() => {
    const dialog = ref.current;
    if (!tool || !dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [tool]);

  if (!tool) return null;
  const captions = tool.id === "captions";
  const hasMedia = Boolean(video || youtube);
  return (
    <dialog ref={ref} className="tool-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([hidden]), select:not(:disabled), video[controls], [tabindex="0"]',
        ));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <header className="tool-dialog__header">
        <h2 id={`${id}-title`}><span className="tool-icon"><ToolIcon tool={tool.id} /></span>{tool.title}</h2>
        <button type="button" className="tool-dialog__close" aria-label="Fechar ferramenta" onClick={onClose} autoFocus>×</button>
      </header>
      <p id={`${id}-description`} className="tool-dialog__description">{tool.description}</p>
      {video ? <>
        <div className="tool-dialog__video" style={{ aspectRatio: ratio.replace(":", "/") }}>
          <video key={video.url} src={video.url} controls playsInline preload="metadata" aria-label={`Prévia de ${video.file.name}`}
            onError={() => setPreviewError(true)} />
        </div>
        {previewError && <p className="upload-message upload-message--error" role="alert">Não foi possível reproduzir este vídeo. Escolha outro arquivo abaixo.</p>}
        <p className="tool-dialog__filename">{video.file.name} <span>{video.width} × {video.height}</span></p>
        {captions && <CaptionOptions model={model} ratio={ratio} onModel={onModel} onRatio={onRatio} />}
      </> : youtube ? <div className="tool-dialog__reference"><span>Referência do YouTube</span><p>{youtube}</p>
        <p className="flow-muted">O vídeo ainda não foi baixado ou transcrito. Você pode seguir para a demonstração das telas.</p>
        {captions && <CaptionOptions model={model} ratio={ratio} onModel={onModel} onRatio={onRatio} />}
      </div> : captions ? <CaptionExamples /> : <div className="tool-dialog__empty"><ToolIcon tool={tool.id} /><p>Escolha um vídeo para começar</p></div>}
      {loading && <p className="upload-message" role="status">Lendo vídeo…</p>}
      {error && <p className="upload-message upload-message--error" role="alert">{error}</p>}
      {(!hasMedia || loading) && <SourceForm compact loading={loading} onFile={onFile} onYouTube={onYouTube} />}
      {hasMedia && !loading && <>
        <button type="button" className="upload-primary tool-dialog__action" onClick={onContinue} aria-describedby={`${id}-availability`}>
          Abrir projeto
        </button>
        <p id={`${id}-availability`} className="tool-dialog__availability">
          Seu vídeo será aberto no projeto. A transcrição por IA estará disponível em uma próxima etapa.
        </p>
        <SourceForm compact loading={loading} onFile={onFile} onYouTube={onYouTube} />
      </>}
    </dialog>
  );
}
