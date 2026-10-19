import { useState } from "react";
import type { Clip } from "../../lib/clips";
import type { TranscriptSegment } from "../../lib/workspace-types";
import { formatPlaybackTime } from "../../lib/playback";
import { ClipTranscript } from "./ClipTranscript";

interface Props {
  clip: Clip; transcript: TranscriptSegment[]; time: number; loading: boolean; analyzing: boolean;
  error: string | null; onSeek: (time: number) => void; onAnalyze: () => void;
}
export function ClipDetails({clip,transcript,time,loading,analyzing,error,onSeek,onAnalyze}: Props) {
  const [view,setView] = useState<"analysis" | "transcript">("analysis");
  return <section className="clip-inspection__details" aria-label="Detalhes do clipe">
    <header><h3>{clip.title}</h3><p>{formatPlaybackTime(clip.start)} — {formatPlaybackTime(clip.end)} · {Math.round(clip.end-clip.start)} s</p>
      {clip.analysis && <strong className="clip-inspection__score">{clip.score}<small>/100</small></strong>}
    </header>
    <div className="clip-details__views" role="group" aria-label="Conteúdo do clipe">
      <button type="button" aria-pressed={view === "analysis"} onClick={() => setView("analysis")}>Análise do trecho</button>
      <button type="button" aria-pressed={view === "transcript"} onClick={() => setView("transcript")}>Transcrição</button>
    </div>
    <div className="clip-details__scroll">
      {view === "analysis" ? clip.analysis ? <>
        <p>{clip.analysis.summary}</p>
        {clip.analysis.criteria.map(item => <section className="clip-criterion" key={item.label}>
          <h4>{item.label}<span>{item.score}<small>/100</small></span></h4><p>{item.explanation}</p><blockquote>{item.evidence}</blockquote>
        </section>)}
      </> : <div aria-busy={analyzing}>
        {analyzing ? <p role="status">Analisando o trecho…</p> : <><p role={error ? "alert" : undefined}>{error ?? "Analise este clipe para ver o resumo e os critérios da nota."}</p>
          <button type="button" className="flow-button" disabled={loading} onClick={onAnalyze}>{error ? "Tentar novamente" : "Analisar trecho"}</button></>}
      </div> : <>
        <ClipTranscript segments={transcript} start={clip.start} end={clip.end} time={time} onSeek={onSeek}/>
        {loading ? <p role="status">Carregando transcrição…</p> : !transcript.length && <p>Este clipe não tem transcrição.</p>}
      </>}
    </div>
  </section>;
}
