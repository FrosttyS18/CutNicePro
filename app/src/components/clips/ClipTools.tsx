import { AppSelect } from "../AppSelect";
import { useEffect, useRef, useState } from "react";
import { ScissorsIcon } from "@phosphor-icons/react/dist/csr/Scissors";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import type { useClips } from "../../hooks/useClips";
import type { EditorSettings } from "../../lib/workspace-types";
import type { Clip, ClipQuality } from "../../lib/clips";
import { clipMessage } from "../../lib/clips";
import { FlowDialog } from "../workspace/FlowDialog";
import { ProcessingDialog } from "../workspace/ProcessingDialog";
import "./clips.css";
import { ClipFormatPicker } from "./ClipFormatPicker";
import type { AspectRatio } from "../upload/tools";

interface Props {
  controller: ReturnType<typeof useClips>; settings: EditorSettings; ready: boolean; disabled: boolean;
  onSave: () => Promise<boolean>; onShowClips: () => void;
  activeClip?: Clip;
  activeClipId?: string;
  onFullVideo: () => void;
  libraryView?: boolean;
}
export function ClipTools({ controller: c, settings, ready, disabled, onSave, onShowClips, activeClip, activeClipId, onFullVideo, libraryView=false }: Props) {
  const [dialog, setDialog] = useState<"generate" | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [automatic, setAutomatic] = useState(true);
  const [count, setCount] = useState(3);
  const [duration, setDuration] = useState(60);
  const [quality, setQuality] = useState<ClipQuality>("standard");
  const [format,setFormat] = useState<AspectRatio>("9:16");
  const [preparing, setPreparing] = useState(false);
  const requestedGeneration = useRef(false);
  useEffect(() => {
    if (!requestedGeneration.current || !c.job || c.job.state === "running") return;
    requestedGeneration.current = false;
    if (c.job.state === "completed" && c.job.stage === "analyzing") {
      onShowClips();
    }
  }, [c.job,onShowClips]);
  async function generate() {
    setPreparing(true);
    try {
      if (await onSave()) {
        setDialog(null); requestedGeneration.current = true;
        // Automático não envia duração nem quantidade — os limites técnicos
        // são resolvidos pelo app. Personalizado envia os três valores; a
        // duração mínima é técnica (10 s), sem vínculo com a máxima.
        await c.generate(automatic
          ? { automatic: true, format, ...(quality !== "standard" ? { quality } : {}) }
          : { minSeconds: 10, maxSeconds: duration, count, format, ...(quality !== "standard" ? { quality } : {}) });
      }
    }
    finally { setPreparing(false); }
  }
  async function exportVideo(value: EditorSettings, clip?: Clip) {
    setPreparing(true);
    try { if (await onSave()) { setDialog(null); await c.exportVideo(value, clip?.id); } } finally { setPreparing(false); }
  }
  const busy = c.busy || disabled || preparing;
  return <div className="clip-tools">
    <button type="button" className="flow-button" disabled={busy || !ready} onClick={() => setDialog("generate")}><ScissorsIcon size={18} aria-hidden="true"/>{c.collection ? "Atualizar cortes" : "Gerar cortes"}</button>
    {!libraryView && c.collection && <button type="button" className="flow-button" disabled={busy} onClick={() => void (async () => { if (await onSave()) onShowClips(); })()}><FilmStripIcon size={18} aria-hidden="true"/>Cortes ({c.collection.clips.filter(clip=>clip.review !== "rejected").length}){c.collection.engine?.backend === "experimentalGemma" ? " · experimental" : ""}</button>}
    {!libraryView && activeClipId && <button type="button" className="flow-button" disabled={busy} onClick={onFullVideo}><FilmStripIcon size={18} aria-hidden="true"/>Voltar ao vídeo completo</button>}
    {!libraryView && <button type="button" className="flow-button" disabled={busy || Boolean(activeClipId && activeClip?.review !== "approved")} onClick={() => void exportVideo(ready ? settings : { ...settings, captionModel: 0 },activeClip)}><DownloadSimpleIcon size={18} aria-hidden="true"/>Exportar vídeo</button>}
    {!libraryView && activeClip && activeClip.review !== "approved" && <button type="button" className="flow-button" disabled={busy} onClick={() => void c.review(activeClip.id,"approved")}>Aprovar corte</button>}
    {!ready && <p className="flow-muted">Transcreva o vídeo para encontrar cortes e adicionar legendas.</p>}
    {c.error && <p className="upload-message upload-message--error" role="alert">{c.error}<button type="button" className="flow-button" disabled={busy} onClick={c.reload}>Tentar novamente</button></p>}
    {c.notice && <p role="status">{c.notice}</p>}
    <FlowDialog open={dialog === "generate"} title="Gerar cortes" onClose={() => setDialog(null)} busy={preparing}>
      <p className="flow-muted">Escolha como quer receber seus clipes.</p>
      <ClipFormatPicker value={format} onChange={setFormat}/>
      {c.collection && <p>As novas sugestões substituirão a lista atual.</p>}
      <div className="clip-options"><label>Geração<AppSelect aria-label="Geração" name="clipMode" value={automatic ? "automatic" : "custom"} onChange={event => setAutomatic(event.target.value === "automatic")}><option value="automatic">Automática</option><option value="custom">Personalizada</option></AppSelect></label>
        <label>Análise<AppSelect aria-label="Análise" name="clipQuality" value={quality} onChange={event => setQuality(event.target.value as ClipQuality)}><option value="standard">Padrão</option><option value="experimentalGemma">Experimental (Gemma 4)</option></AppSelect></label>
        {!automatic && <label>Duração máxima<AppSelect name="clipDuration" value={duration} onChange={event => setDuration(Number(event.target.value))}><option value={30}>30 segundos</option><option value={60}>1 minuto</option><option value={90}>1 minuto e 30 segundos</option><option value={180}>3 minutos</option></AppSelect></label>}
        {!automatic && <label>Quantidade<input name="clipCount" autoComplete="off" type="number" min={1} max={12} value={count} onChange={event => setCount(Number(event.target.value))}/></label>}</div>
      <p className="flow-muted">{automatic
        ? "A quantidade e a duração saem dos momentos encontrados no vídeo."
        : "Você escolhe a duração máxima e a quantidade de cortes."}</p>
      {quality === "experimentalGemma" && <p className="flow-muted">O modo experimental usa um modelo local maior: a geração fica mais lenta e os resultados substituem a lista atual ao final.</p>}
      <button type="button" className="upload-primary flow-wide" disabled={busy || (!automatic && (!Number.isInteger(count) || count<1 || count>12))} onClick={() => void generate()}>Gerar cortes</button>
    </FlowDialog>
    {c.job && (c.operation === "generate" || c.operation === "export") && <ProcessingDialog key={c.job.jobId} open={c.busy || (c.ownedJob && c.job.state === "failed" && dismissed !== c.job.jobId)} id={c.job.jobId} busy={c.busy}
      title={c.job.stage === "analyzing" ? "Encontrando cortes…" : "Exportando…"} status={c.job.stage === "analyzing" ? "Analisando cenas e falas" : "Preparando seu vídeo"}
      progress={c.job.progress} error={clipMessage(c.job.error)} cancelDescription="O processamento será interrompido. Seus arquivos e cortes salvos serão mantidos."
      cancelAction={c.job.stage === "analyzing" ? "Cancelar geração de cortes" : "Cancelar exportação"}
      onClose={() => setDismissed(c.job!.jobId)} onCancel={c.cancel} onRetry={() => {
        setDismissed(c.job!.jobId);
        if (c.job!.stage === "analyzing") setDialog("generate"); else void exportVideo(settings,activeClip);
      }}/>}
  </div>;
}
