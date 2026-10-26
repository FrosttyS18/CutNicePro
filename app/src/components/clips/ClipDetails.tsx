import { useState } from "react";
import type { Clip } from "../../lib/clips";
import type { TranscriptSegment } from "../../lib/workspace-types";
import { formatPlaybackTime } from "../../lib/playback";
import { ClipTranscript } from "./ClipTranscript";

interface Props {
  clip: Clip; transcript: TranscriptSegment[]; time: number; loading: boolean; analyzing: boolean;
  error: string | null; onSeek: (time: number) => void; onAnalyze: () => void;
  /** Limites EFETIVOS (intervalo editado dentro do clipe — upd 20). */
  from: number; to: number;
}
export function ClipDetails({clip,transcript,time,loading,analyzing,error,onSeek,onAnalyze,from,to}: Props) {
  const [view,setView] = useState<"analysis" | "transcript">("analysis");
  // upd 20: nota e critérios exigem análise VÁLIDA; desatualizada nunca é
  // publicada como avaliação concluída do texto atual
  const manual = clip.origin === "manual" || clip.manuallyEdited;
  const valid = !manual && clip.analysis && !clip.analysisStale;
  return <section className="clip-inspection__details" aria-label="Detalhes do clipe">
    <header><h3>{clip.title}</h3><p>{formatPlaybackTime(from)} — {formatPlaybackTime(to)} · {Math.round(to-from)} s</p>
      {manual ? <p>{clip.origin === "manual" ? "Manual" : "Editado manualmente"}</p> : valid && <strong className="clip-inspection__score">{clip.score}<small>/100</small></strong>}
      {!manual && clip.faceFraming && <p className="flow-muted">{
        clip.faceFraming.status === "stable" ? "Rosto detectado para o enquadramento inicial."
          : clip.faceFraming.status === "ambiguous" ? "Sem um rosto principal definido. Você pode ajustar o enquadramento no editor."
          : clip.faceFraming.status === "noFaces" ? "Nenhum rosto seguro para ajustar; enquadramento original mantido."
          : "Detecção de rostos indisponível; enquadramento original mantido."
      }</p>}
    </header>
    <div className="clip-details__views" role="group" aria-label="Conteúdo do clipe">
      <button type="button" aria-pressed={view === "analysis"} onClick={() => setView("analysis")}>Análise do trecho</button>
      <button type="button" aria-pressed={view === "transcript"} onClick={() => setView("transcript")}>Transcrição</button>
    </div>
    <div className="clip-details__scroll">
      {view === "analysis" ? manual ? <p>Esta montagem foi salva manualmente e não tem nota de ranking.</p> : valid ? <>
        <p>{clip.analysis!.summary}</p>
        {clip.analysis!.criteria.map(item => <section className="clip-criterion" key={item.label}>
          <h4>{item.label}<span>{item.score}<small>/100</small></span></h4><p>{item.explanation}</p><blockquote>{item.evidence}</blockquote>
        </section>)}
        {clip.multimodal && <section className="clip-criterion clip-criterion--evidence" aria-label="Evidências multimodais">
          <h4>Evidências recebidas<span>{clip.multimodal.backend === "experimentalGemmaMultimodal" ? "texto + áudio + frames" : "texto"}</span></h4>
          <p>{clip.multimodal.visual}</p>
          <blockquote>frames em {clip.multimodal.frames.map(f => `${f.toFixed(1)}s`).join(", ")}
            {clip.multimodal.audioEvents.length ? ` · ${clip.multimodal.audioEvents.join(" · ")}` : " · sem pausas detectadas no intervalo"}
            {(clip.multimodal.boundaryAdjustments[0] !== 0 || clip.multimodal.boundaryAdjustments[1] !== 0)
              ? ` · fronteiras ajustadas por pausa: ${clip.multimodal.boundaryAdjustments[0] >= 0 ? "+" : ""}${clip.multimodal.boundaryAdjustments[0].toFixed(2)}s / ${clip.multimodal.boundaryAdjustments[1] >= 0 ? "+" : ""}${clip.multimodal.boundaryAdjustments[1].toFixed(2)}s` : ""}</blockquote>
        </section>}
      </> : <div aria-busy={analyzing}>
        {analyzing ? <p role="status">Analisando o trecho…</p> : <><p role={error || clip.analysisError ? "alert" : undefined}>{error ?? clip.analysisError ?? (clip.analysisStale ? "A transcrição deste trecho mudou depois desta análise. Analise novamente para atualizar a avaliação." : "Analise este clipe para ver o resumo e os critérios da nota.")}</p>
          <button type="button" className="flow-button" disabled={loading} onClick={onAnalyze}>{error || clip.analysisStale ? "Analisar novamente" : "Analisar trecho"}</button></>}
      </div> : <>
        <ClipTranscript segments={transcript} start={clip.start} end={clip.end} time={time} onSeek={onSeek}/>
        {loading ? <p role="status">Carregando transcrição…</p> : !transcript.length && <p>Este clipe não tem transcrição.</p>}
      </>}
    </div>
  </section>;
}
