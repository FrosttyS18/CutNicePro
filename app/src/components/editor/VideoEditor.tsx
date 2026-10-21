import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ArrowBendUpLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowBendUpLeft";
import { FloppyDiskIcon } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import type { CaptionStyle } from "../../lib/captions";
import { useEditorLayout } from "../../hooks/useEditorLayout";
import { clampTime } from "../../lib/workspace";
import { useEditHistory } from "../../hooks/useEditHistory";
import { isolatedClipSettings } from "../../lib/clips";
import { editTranscriptSegment } from "../../lib/transcript-text";
import { captionCue, effectiveCaptionStyle } from "../../lib/captions";
import type { Clip } from "../../lib/clips";
import type { EditorSettings, WorkspaceData } from "../../lib/workspace-types";
import { VideoPreview } from "../workspace/VideoPreview";
import { TranscriptPanel } from "../workspace/TranscriptPanel";
import { EditorTimeline } from "./EditorTimeline";
import { EditorInspector, panelForTool } from "./EditorInspector";
import { usePlaybackShortcut } from "../../hooks/usePlaybackShortcut";
import { FramingToolbar } from "./FramingToolbar";

interface Props {
  title: string;
  activeClip?: Clip;
  data: WorkspaceData;
  localUrl: string | null;
  dirty: boolean;
  onChange: (data: WorkspaceData) => void;
  onSave: () => Promise<boolean> | boolean | void;
  onBack: () => void;
  transcriptionControls?: ReactNode;
  transcribing?: boolean;
  /** Cortes do projeto — usados por "Aplicar a todos os cortes" (commit único, desfazível). */
  allClips?: Clip[];
}

export function VideoEditor({ title, activeClip, data, localUrl, dirty, onChange, onSave, onBack, transcriptionControls, transcribing, allClips }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const serialize = useCallback(
    (value: WorkspaceData) =>
      JSON.stringify({ settings: value.settings, transcript: value.transcript, clipEdits: value.clipEdits }),
    [],
  );
  interface EditSnapshot { settings: EditorSettings; transcript: WorkspaceData["transcript"]; clipEdits?: Record<string, EditorSettings> }
  const history = useEditHistory<EditSnapshot>({ settings: data.settings, transcript: data.transcript, clipEdits: data.clipEdits }, serialize as (value: EditSnapshot) => string);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error" | "dirty">("saved");
  const dataRef = useRef(data);
  const saveRef = useRef(onSave);
  // desfazer/refazer: o snapshot guarda apenas {settings, transcript,
  // clipEdits}; a mídia/fonte atuais são mantidas do presente
  const dataRefForRestore = useRef(data);
  useEffect(() => {
    dataRef.current = data;
    dataRefForRestore.current = data;
    saveRef.current = onSave;
  }, [data, onSave]);
  const restoreFromSnapshot = useCallback((snap: EditSnapshot) => {
    onChange({
      ...dataRefForRestore.current,
      settings: snap.settings,
      transcript: snap.transcript,
      clipEdits: snap.clipEdits,
    });
  }, [onChange]);
  useEffect(() => {
    history.restore(restoreFromSnapshot);
  }, [history, restoreFromSnapshot]);
  const changeWithHistory = useCallback(
    (next: WorkspaceData, group = "") => {
      onChange(next);
      // commit recebe o SNAPSHOT novo (a fonte ainda não re-renderizou)
      history.commit({ settings: next.settings, transcript: next.transcript, clipEdits: next.clipEdits }, group);
    },
    [onChange, history],
  );
  // autosave serializado: nunca sobrescreve gravação mais nova por antiga
  const saving = useRef(false);
  const pending = useRef(false);
  const runSave = useCallback(async () => {
    if (saving.current) { pending.current = true; return; }
    saving.current = true;
    try {
      for (;;) {
        pending.current = false;
        setSaveState("saving");
        const ok = await Promise.resolve(saveRef.current());
        if (!ok) { setSaveState("error"); return; }
        if (!pending.current) break;
      }
      setSaveState("saved");
      setToastGeracao(g => g + 1);
    } finally {
      saving.current = false;
    }
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void runSave(), 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, data, runSave]);
  const displayStatus = dirty && saveState === "saved" ? "dirty" : saveState;
  // status de salvamento vira TOAST temporário (pedido upd 15: nada de texto
  // fixo na UI); a auto-soma é feita por animação CSS (sem timer em effect)
  const [toastGeracao, setToastGeracao] = useState(0);
  const changeSettings = (settings: Partial<EditorSettings>) => changeWithHistory({ ...data, settings: { ...data.settings, ...settings } }, "settings");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(data.media?.duration ?? null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState(panelForTool(data.tool));
  const [framing, setFraming] = useState(false);
  const { layout, beginResize } = useEditorLayout();
  const canPlay = Boolean(localUrl);
  const activateFraming = (active: boolean) => {
    setFraming(active);
    if (active) {
      setPanel("reframe");
      if (data.settings.fit !== "cover") changeSettings({ fit: "cover" });
    }
  };
  // atalhos: desfazer/refazer e sair do modo Enquadrar (não intercepta texto)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "Escape" && framing) { setFraming(false); return; }
      if (typing || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) { event.preventDefault(); history.undo(); }
      else if (key === "z" && event.shiftKey) { event.preventDefault(); history.redo(); }
      else if (key === "y") { event.preventDefault(); history.redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [framing, history]);
  // arraste do vídeo no modo Enquadrar (imagem) ou da legenda na aba Legendas
  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!framing && panel === "captions") {
      const startY = event.clientY;
      const style = effectiveCaptionStyle(data.settings.captionModel, data.settings.captionStyle);
      const baseY = style.y ?? 0.86;
      const moveCaption = (moveEvent: PointerEvent) => {
        const y = Math.min(0.9, Math.max(0.1, baseY + (moveEvent.clientY - startY) / rect.height));
        changeSettings({ captionStyle: { ...style, y } });
      };
      const upCaption = () => {
        window.removeEventListener("pointermove", moveCaption);
        window.removeEventListener("pointerup", upCaption);
      };
      event.preventDefault();
      window.addEventListener("pointermove", moveCaption);
      window.addEventListener("pointerup", upCaption);
      return;
    }
    if (!framing || data.settings.fit !== "cover") return;
    const startX = event.clientX;
    const startY = event.clientY;
    const base = { x: data.settings.focalPoint?.x ?? 50, y: data.settings.focalPoint?.y ?? 50 };
    const move = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100;
      const clamp100 = (value: number) => Math.min(100, Math.max(0, value));
      changeSettings({ focalPoint: { x: clamp100(base.x - dx), y: clamp100(base.y - dy) } });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    event.preventDefault();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const focusTrim = () => {
    setFraming(false);
    document.querySelector("#editor-trim")?.scrollIntoView({ block: "center", behavior: "smooth" });
    document.querySelector<HTMLInputElement>("#editor-trim input")?.focus();
  };
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
  const cue = captionCue(data.transcript,time,effectiveCaptionStyle(data.settings.captionModel,data.settings.captionStyle).wordsPerCaption);
  // popover "Ações do projeto" no cabeçalho: transcrição/cortes/exportação fora do inspetor
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!actionsOpen) return;
    const close = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [actionsOpen]);
  // aplica o estilo de legenda a todos os cortes em UM commit (desfazível de uma vez)
  const applyCaptionsToAll = useCallback(async (model: number, style: CaptionStyle) => {
    if (!allClips?.length) throw new Error("Este projeto ainda não tem cortes.");
    const edits = { ...(data.clipEdits ?? {}) };
    for (const clip of allClips) {
      const base = edits[clip.id] ?? isolatedClipSettings(clip, undefined, data.media);
      edits[clip.id] = { ...base, captionModel: model, captionStyle: { ...style } };
    }
    changeWithHistory({ ...data, clipEdits: edits, settings: { ...data.settings, captionModel: model, captionStyle: { ...style } } }, "apply-all");
  }, [allClips, data, changeWithHistory]);
  return (
    <section className="video-editor" data-testid="video-editor" aria-label="Editor de vídeo">
      <header className="editor-header editor-header--compact">
        <button type="button" className="editor-icon-button" onClick={onBack} title="Voltar ao projeto" aria-label="Voltar ao projeto"><ArrowLeftIcon size={18} aria-hidden="true"/></button>
        <h1>{title}</h1>
        <div className="editor-header__actions">
          <span role="status" data-testid="editor-save-status" className="sr-only">
            {displayStatus === "saving" ? "Salvando…" : displayStatus === "error" ? "Falha ao salvar" : displayStatus === "dirty" ? "Alterações não salvas" : "Alterações salvas"}
          </span>
          {displayStatus === "saved" && (
            <div key={`ok-${toastGeracao}`} className="editor-toast editor-toast--ok" role="status" data-testid="editor-toast">
              <svg width="15" height="15" viewBox="0 0 256 256" fill="#4ade80" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"></path></svg>
              <span>Alterações salvas</span>
            </div>
          )}
          {displayStatus === "error" && (
            <div key={`erro-${toastGeracao}`} className="editor-toast editor-toast--erro" role="alert" data-testid="editor-toast-erro">
              <svg width="15" height="15" viewBox="0 0 256 256" fill="#ff8787" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm-8,56a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1-12-12A12,12,0,0,1,128,168Z"></path></svg>
              <span>Falha ao salvar</span>
            </div>
          )}
          {transcriptionControls && <div className="editor-actions" ref={actionsRef}>
            <button type="button" className="editor-icon-button" aria-label="Ações do projeto" title="Ações do projeto (transcrever, cortes, exportar)"
              aria-haspopup="dialog" aria-expanded={actionsOpen} onClick={() => setActionsOpen(current => !current)}>
              <ListIcon size={18} aria-hidden="true"/>
            </button>
            {actionsOpen && <div className="editor-actions__popover" role="dialog" aria-label="Ações do projeto">{transcriptionControls}</div>}
          </div>}
          <button type="button" className="editor-icon-button" disabled={!history.canUndo} onClick={history.undo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer (Ctrl+Z)"><ArrowCounterClockwiseIcon size={18} aria-hidden="true"/></button>
          <button type="button" className="editor-icon-button" disabled={!history.canRedo} onClick={history.redo} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer (Ctrl+Shift+Z)"><ArrowClockwiseIcon size={18} aria-hidden="true"/></button>
          {data.activeClipId && activeClip && <button type="button" className="editor-icon-button" onClick={() => {
            const { [data.activeClipId!]: _descartado, ...demaisEdicoes } = data.clipEdits ?? {};
            changeWithHistory({ ...data, clipEdits: demaisEdicoes, settings: isolatedClipSettings(activeClip, undefined, data.media) }, "restore");
          }} title="Restaurar corte original (descarta o rascunho deste corte)" aria-label="Restaurar corte original"><ArrowBendUpLeftIcon size={18} aria-hidden="true"/></button>}
          <button type="button" className="editor-icon-button" disabled={!dirty} onClick={() => void runSave()} title="Salvar agora" aria-label="Salvar agora"><FloppyDiskIcon size={18} aria-hidden="true"/></button>
        </div>
        </header>
      <div className="editor-layout" style={{ ["--transcript-width" as string]: `${layout.transcriptWidth}px`, ["--inspector-width" as string]: `${layout.inspectorWidth}px` }}>
        <div className="editor-pane editor-pane--transcript">
          <TranscriptPanel segments={data.transcript} demo={data.transcriptMode === "demo"} currentTime={time} canSeek={canPlay && Boolean(duration)} generated={data.transcriptMode === "real"} readOnly={transcribing}
            onSeek={seek} onText={(id, text, words) => changeWithHistory({ ...data, transcript: data.transcript.map((segment) => segment.id === id ? { ...editTranscriptSegment(segment,text), words } : segment) }, "transcript")} />
          <div className="editor-pane__divider" role="separator" aria-orientation="vertical"
            aria-label="Redimensionar transcrição (arraste)" title="Arraste para redimensionar a transcrição"
            onPointerDown={beginResize("transcript")}/>
        </div>
        <div className="editor-stage"><FramingToolbar settings={data.settings} framing={framing} onSettings={changeSettings} onFraming={activateFraming} onFocusTrim={focusTrim}/>
          {framing && <p className="editor-stage__hint" role="status">Modo Enquadrar ativo: arraste o vídeo na prévia para reposicionar a imagem dentro do quadro. As legendas ficam no lugar. Esc ou "Concluir enquadramento" para sair.</p>}
          <div className="editor-stage__canvas" data-framing={framing} onPointerDown={onCanvasPointerDown}><VideoPreview media={data.media} localUrl={localUrl} settings={data.settings} videoRef={video} cue={cue} nativeControls={false} onTogglePlay={togglePlay}
            onDuration={value => { setDuration(value); if (video.current && video.current.currentTime < data.settings.trimStart) { video.current.currentTime = data.settings.trimStart; setTime(data.settings.trimStart); } }} onTime={(value) => {
              setTime(value);
              if (data.settings.trimEnd !== null && value >= data.settings.trimEnd && video.current && !video.current.paused) video.current.pause();
            }} /></div>
          {data.media?.kind === "youtube" && <p className="flow-muted">Importe o arquivo do vídeo para editar.</p>}
          {!localUrl && data.media?.kind !== "youtube" && <p className="flow-muted">Volte ao projeto para conectar o arquivo de vídeo.</p>}
          {error && <p className="upload-message upload-message--error" role="alert">{error}</p>}
        </div>
        <div className="editor-pane editor-pane--inspector">
          <div className="editor-pane__divider editor-pane__divider--left" role="separator" aria-orientation="vertical"
            aria-label="Redimensionar ferramentas (arraste)" title="Arraste para redimensionar as ferramentas"
            onPointerDown={beginResize("inspector")}/>
          <EditorInspector panel={panel} settings={data.settings} onPanel={setPanel} onSettings={changeSettings}
            onApplyAll={applyCaptionsToAll} />
        </div>
      </div>
      <div className="editor-pane editor-pane--timeline" style={{ ["--timeline-height" as string]: `${layout.timelineHeight}px` }}>
        <div className="editor-pane__divider editor-pane__divider--horizontal" role="separator" aria-orientation="horizontal"
          aria-label="Redimensionar linha do tempo (arraste)" title="Arraste para redimensionar a linha do tempo"
          onPointerDown={beginResize("timeline")}/>
        <EditorTimeline mediaId={data.media?.mediaId} localUrl={localUrl} duration={duration} time={time} playing={playing} canPlay={canPlay} settings={data.settings} onSeek={seek}
          onSettings={changeSettings} onTogglePlay={togglePlay} />
      </div>
    </section>
  );
}

