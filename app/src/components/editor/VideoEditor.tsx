import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSplitVerification } from "../../hooks/useSplitVerification";
import { splitLayoutAt, splitViewport, updateSplitPanel } from "../../lib/split-screen";
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
import { FrameSeeker, type ScrubCanvas } from "../../lib/frame-seeker";
import { effectiveSegments, nextBoundary, snapSeek } from "../../lib/edit-plan";
import { TranscriptPanel } from "../workspace/TranscriptPanel";
import { EditorTimeline } from "./EditorTimeline";
import { EditorInspector, panelForTool } from "./EditorInspector";
import { usePlaybackShortcut } from "../../hooks/usePlaybackShortcut";
import { FramingToolbar } from "./FramingToolbar";
import { CompositionEditor } from "./CompositionEditor";

interface Props {
  projectId?: string;
  title: string;
  activeClip?: Clip;
  data: WorkspaceData;
  localUrl: string | null;
  dirty: boolean;
  onChange: (data: WorkspaceData) => void;
  onSave: () => Promise<boolean> | boolean;
  onBack: () => void;
  transcriptionControls?: ReactNode;
  transcribing?: boolean;
  /** Cortes do projeto — usados por "Aplicar a todos os cortes" (commit único, desfazível). */
  allClips?: Clip[];
}

export function VideoEditor(props:Props) {
  return props.projectId ? <CompositionEditor {...props} projectId={props.projectId}/> : <LegacyVideoEditor {...props}/>;
}

function LegacyVideoEditor({ projectId, title, activeClip, data, localUrl, dirty, onChange, onSave, onBack, transcriptionControls, transcribing, allClips }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const serialize = useCallback(
    (value: WorkspaceData) =>
      JSON.stringify({ settings: value.settings, transcript: value.transcript, clipEdits: value.clipEdits }),
    [],
  );
  interface EditSnapshot { settings: EditorSettings; transcript: WorkspaceData["transcript"]; clipEdits?: Record<string, EditorSettings> }
  const history = useEditHistory<EditSnapshot>({ settings: data.settings, transcript: data.transcript, clipEdits: data.clipEdits }, serialize as (value: EditSnapshot) => string);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error" | "dirty">("saved");
  const [toastGeracao, setToastGeracao] = useState(0);
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
      const previous = dataRef.current.settings;
      if (next.settings.splitScreen?.faceValidated
        && (next.settings.trimStart !== previous.trimStart || next.settings.trimEnd !== previous.trimEnd)) {
        next = { ...next, settings: { ...next.settings, splitScreen: { ...next.settings.splitScreen, faceValidated: false } } };
      }
      onChange(next);
      // commit recebe o SNAPSHOT novo (a fonte ainda não re-renderizou)
      history.commit({ settings: next.settings, transcript: next.transcript, clipEdits: next.clipEdits }, group);
    },
    [onChange, history],
  );
  const saving = useRef(false);
  const runSave = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      setSaveState("saving");
      const ok = await Promise.resolve(saveRef.current());
      if (!ok) { setSaveState("error"); return; }
      setSaveState("saved");
      setToastGeracao(g => g + 1);
    } catch {
      setSaveState("error");
    } finally {
      saving.current = false;
    }
  }, []);
  const displayStatus = dirty && saveState === "saved" ? "dirty" : saveState;
  const changeSettings = (settings: Partial<EditorSettings>) => changeWithHistory({ ...data, settings: { ...data.settings, ...settings } }, "settings");
  const acceptSplitVerification = useCallback((patch: Partial<EditorSettings>) => {
    const current = dataRef.current;
    onChange({ ...current, settings: { ...current.settings, ...patch } });
  }, [onChange]);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(data.media?.duration ?? null);
  const splitSource = useMemo(() => projectId && localUrl && data.media?.kind === "local" && data.media.mediaId && duration
    ? { projectId, mediaId: data.media.mediaId, start: data.settings.trimStart, end: data.settings.trimEnd ?? duration,
      viewport: splitViewport(data.media.width, data.media.height, data.settings) } : undefined,
  [projectId, localUrl, data.media, data.settings, duration]);
  const splitNotice = useSplitVerification(data.settings, splitSource, acceptSplitVerification);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState(panelForTool(data.tool));
  const [framing, setFraming] = useState(false);
  const canvasCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => canvasCleanup.current?.(), []);
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
      else if (key === "s") { event.preventDefault(); if (dirty) void runSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [framing, history, dirty, runSave]);
  // arraste do vídeo no modo Enquadrar (imagem) ou da legenda na aba Legendas
  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const preview = event.currentTarget.querySelector<HTMLElement>(".workspace-preview");
    if (!preview?.contains(event.target as Node)) return;
    const rect = preview.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvasCleanup.current?.();
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
        window.removeEventListener("pointercancel", upCaption);
        canvasCleanup.current = null;
      };
      event.preventDefault();
      window.addEventListener("pointermove", moveCaption);
      window.addEventListener("pointerup", upCaption);
      window.addEventListener("pointercancel", upCaption);
      canvasCleanup.current = upCaption;
      return;
    }
    if (!framing || (!data.settings.splitScreen && data.settings.fit !== "cover")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const base = { x: data.settings.focalPoint?.x ?? 50, y: data.settings.focalPoint?.y ?? 50 };
    const split = data.settings.splitScreen;
    const activeSplit = split?.faceValidated ? splitLayoutAt(split, time) : null;
    const splitPanel = event.clientY - rect.top < rect.height / 2 ? "top" : "bottom";
    const move = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100;
      const clamp100 = (value: number) => Math.min(100, Math.max(0, value));
      if (split && activeSplit) {
        changeSettings({ splitScreen: updateSplitPanel(split, time, splitPanel, { x: clamp100(activeSplit[splitPanel].x - dx), y: clamp100(activeSplit[splitPanel].y - dy * 2) }) });
      } else changeSettings({ focalPoint: { x: clamp100(base.x - dx), y: clamp100(base.y - dy) } });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      canvasCleanup.current = null;
    };
    event.preventDefault();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    canvasCleanup.current = up;
  };
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    element.addEventListener("play", play); element.addEventListener("pause", pause);
    return () => { element.removeEventListener("play", play); element.removeEventListener("pause", pause); };
  }, [localUrl]);

  // Coalescência de seek (upd 19): durante o arrasto, NOVOS seeks não são
  // enviados ao <video> enquanto o decodificador ainda processa o anterior
  // (video.seeking === true). A última posição fica pendente e é aplicada
  // quando o seek anterior conclui. Isso impede que o decodificador do
  // WebView2 acumule buffers de múltiplas operações concorrentes — a causa
  // do crescimento descontrolado de memória (10–14 GB) no scrub.
  const pendingSeekRef = useRef<number | null>(null);
  // Scrub WebCodecs (timeline 2026-10-22, candidata 2): o <video> decoda
  // do keyframe até o alvo (dezenas/centenas de frames por salto em H.264
  // 1080p) — inerentemente lento para saltos distantes. O FrameSeeker
  // (mediabunny, mesmo mecanismo do VideoCache do OpenCut Classic) decoda
  // APENAS o frame alvo e desenha num canvas sobreposto durante o arrasto;
  // o <video> continua sendo autoridade de playback/áudio/exportação. O
  // overlay sai quando o frame do <video> alcança o alvo (seeked sem
  // pendentes) ou ao dar play.
  const seekerRef = useRef<FrameSeeker | null>(null);
  const [scrub, setScrub] = useState<{ canvas: ScrubCanvas; localUrl: string; sourceTime: number } | null>(null);
  // troca de mídia invalida o overlay por derivação (canvas de outra fonte não aparece)
  const scrubCanvas = scrub && scrub.localUrl === localUrl ? scrub.canvas : null;
  const seekRequest = useRef(0);
  useEffect(() => () => {
    seekRequest.current++;
    seekerRef.current?.dispose();
    seekerRef.current = null;
  }, [localUrl]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const clearScrub = () => setScrub(null);
    const onSeeked = () => {
      const pending = pendingSeekRef.current;
      if (pending !== null) {
        pendingSeekRef.current = null;
        element.currentTime = pending;
      } else if (!element.seeking) {
        clearScrub(); // <video> alcançou o alvo — deixa o frame nativo aparecer
      }
    };
    const onPlay = () => { seekRequest.current++; clearScrub(); };
    element.addEventListener("seeked", onSeeked);
    element.addEventListener("play", onPlay);
    return () => { element.removeEventListener("seeked", onSeeked); element.removeEventListener("play", onPlay); };
  }, [localUrl]);
  function seek(value: number) {
    if (!video.current || !duration) return;
    // Plano de edição (M2): eixo da timeline continua no TEMPO DA FONTE; o
    // seek salta vãos para o próximo segmento (prévia composta).
    const bounded = clampTime(value, duration);
    const next = !video.current.paused && (activeClip || data.settings.editPlan)
      ? snapSeek(effectiveSegments(data.settings, duration), bounded) : bounded;
    setTime(next); // playhead sempre responde imediatamente
    // frame instantâneo durante scrub (pausado): só quando há Blob registrado
    const mediaId = data.media?.mediaId;
    if (mediaId && video.current.paused) {
      if (localUrl) {
        const url = localUrl;
        const request = ++seekRequest.current;
        seekerRef.current ??= new FrameSeeker();
        void seekerRef.current.getFrameAt(mediaId, url, next).then((canvas) => {
          // aplica só se ainda faz sentido: mesma mídia E o <video> ainda
          // não alcançou o alvo (resolução tardia não ressuscita o overlay)
          const element = video.current;
          const videoCaughtUp = element && !element.seeking && Math.abs(element.currentTime - next) < 0.05;
          if (canvas && request === seekRequest.current && element?.paused && !videoCaughtUp) setScrub({ canvas, localUrl: url, sourceTime: next });
        }).catch(() => { /* mantém overlay anterior ou nenhum */ });
      }
    }
    if (video.current.seeking) {
      // decoder ocupado: guarda a posição mais recente (descarta intermediárias)
      pendingSeekRef.current = next;
    } else {
      pendingSeekRef.current = null;
      video.current.currentTime = next;
    }
  }

  function togglePlay() {
    const element=video.current;
    if(!element) return;
    if(element.paused) {
      // Plano (M2): retomada sempre dentro da composição — vão/fim reinicia
      // no ponto coerente (próximo segmento ou primeiro segmento).
      if ((activeClip || data.settings.editPlan) && duration) {
        const segments = effectiveSegments(data.settings, duration);
        const first = segments[0]?.sourceStart ?? data.settings.trimStart;
        const lastEnd = segments[segments.length - 1]?.sourceEnd ?? data.settings.trimEnd ?? duration;
        if (element.currentTime < first || element.currentTime >= lastEnd) seek(first);
        else {
          const snapped = snapSeek(segments, element.currentTime);
          if (snapped !== element.currentTime) seek(snapped);
        }
      }
      else if(element.currentTime<data.settings.trimStart || (data.settings.trimEnd!==null && element.currentTime>=data.settings.trimEnd)) seek(data.settings.trimStart);
      void element.play().catch(()=>setError("Não foi possível iniciar a reprodução. Tente novamente."));
    } else element.pause();
  }
  usePlaybackShortcut(canPlay && !transcribing,togglePlay);
  const cue = captionCue(data.transcript,time,effectiveCaptionStyle(data.settings.captionModel,data.settings.captionStyle).wordsPerCaption);
  // Desacoplamento da timeline (upd 20): cada setTime() durante o arrasto
  // re-renderizava TODOS os filhos do editor. TranscriptPanel (334+ seg-
  // mentos com highlighting por palavra) é o mais caro; agora recebe um
  // tempo THROTTLED (só atualiza 150ms após a última mudança, ou imediato
  // se parado). O playhead da timeline continua imediato (usa `time`).
  const [transcriptTime, setTranscriptTime] = useState(0);
  const transcriptTimer = useRef(0);
  useEffect(() => {
    if (transcriptTimer.current) clearTimeout(transcriptTimer.current);
    transcriptTimer.current = window.setTimeout(() => setTranscriptTime(time), 150);
    return () => clearTimeout(transcriptTimer.current);
  }, [time]);
  // EditorInspector NÃO depende de time — memo para não re-renderizar no drag
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
          {displayStatus === "saved" && toastGeracao > 0 && (
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
          <button type="button" className="flow-button" disabled={!dirty || displayStatus === "saving"} onClick={() => void runSave()} aria-label="Salvar"><FloppyDiskIcon size={18} aria-hidden="true"/>Salvar</button>
        </div>
        </header>
      <div className="editor-layout" style={{ ["--transcript-width" as string]: `${layout.transcriptWidth}px`, ["--inspector-width" as string]: `${layout.inspectorWidth}px` }}>
        <div className="editor-pane editor-pane--transcript">
          <TranscriptPanel segments={data.transcript} demo={data.transcriptMode === "demo"} currentTime={transcriptTime} canSeek={canPlay && Boolean(duration)} generated={data.transcriptMode === "real"} readOnly={transcribing}
            onSeek={seek} onText={(id, text, words) => changeWithHistory({ ...data, transcript: data.transcript.map((segment) => segment.id === id ? { ...editTranscriptSegment(segment,text), words } : segment) }, "transcript")} />
          <div className="editor-pane__divider" role="separator" aria-orientation="vertical"
            aria-label="Redimensionar transcrição (arraste)" title="Arraste para redimensionar a transcrição"
            onPointerDown={beginResize("transcript")}/>
        </div>
        <div className="editor-stage"><FramingToolbar framing={framing} onFraming={activateFraming}/>
          {splitNotice && <p className="editor-stage__hint" role="status">{splitNotice}</p>}
          {framing && <p className="editor-stage__hint" role="status">Modo Enquadrar ativo: arraste o vídeo na prévia para reposicionar a imagem dentro do quadro. As legendas ficam no lugar. Esc ou "Concluir enquadramento" para sair.</p>}
          <div className="editor-stage__canvas" data-framing={framing} onPointerDown={onCanvasPointerDown}><VideoPreview media={data.media} localUrl={localUrl} settings={data.settings} videoRef={video} cue={cue} nativeControls={false} onTogglePlay={togglePlay} scrubCanvas={scrubCanvas} scrubTime={scrub?.sourceTime} disableSurfacePlayback={framing}
            onDuration={value => { setDuration(value); if (video.current && video.current.currentTime < data.settings.trimStart) { video.current.currentTime = data.settings.trimStart; setTime(data.settings.trimStart); } }} onTime={(value) => {
              // Autoridade do tempo (upd 20): durante um seek iniciado pelo
              // usuário, o browser dispara timeupdate com o tempo ANTIGO —
              // esses eventos não podem reposicionar o playhead para trás.
              // O alvo do usuário vence até o seek confirmar (seeked).
              if (video.current && video.current.seeking) return;
              // Plano de edição (M2): reprodução composta — ao atingir o fim
              // do segmento atual, salta para o início do próximo (o vão sai
              // da composição); no fim do último segmento, pausa.
              if ((activeClip || data.settings.editPlan) && duration && video.current && !video.current.paused) {
                const segments = effectiveSegments(data.settings, duration);
                const snapped = snapSeek(segments, value);
                const last = segments[segments.length - 1]?.sourceEnd ?? duration;
                if (value < last && Math.abs(snapped - value) > 0.001) { seek(snapped); return; }
                const boundary = nextBoundary(segments, value);
                if (boundary && value >= boundary.from - 0.08) {
                  setTime(boundary.to);
                  video.current.currentTime = boundary.to;
                  return;
                }
                const lastEnd = segments[segments.length - 1]?.sourceEnd ?? duration;
                if (value >= lastEnd - 0.08) {
                  setTime(lastEnd);
                  video.current.pause();
                  return;
                }
              }
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
            source={splitSource} sourceTime={time}
            onApplyAll={applyCaptionsToAll} />
        </div>
      </div>
      <div className="editor-pane editor-pane--timeline" style={{ ["--timeline-height" as string]: `${layout.timelineHeight}px` }}>
        <div className="editor-pane__divider editor-pane__divider--horizontal" role="separator" aria-orientation="horizontal"
          aria-label="Redimensionar linha do tempo (arraste)" title="Arraste para redimensionar a linha do tempo"
          onPointerDown={beginResize("timeline")}/>
        <EditorTimeline mediaId={data.media?.mediaId} localUrl={localUrl} duration={duration} time={time} playing={playing} canPlay={canPlay} settings={data.settings} onSeek={seek}
          onSettings={changeSettings} onTrimSettings={patch => changeWithHistory({ ...data, settings: { ...data.settings, ...patch } })}
          onTogglePlay={togglePlay} planEnabled={Boolean(activeClip)} />
      </div>
    </section>
  );
}

