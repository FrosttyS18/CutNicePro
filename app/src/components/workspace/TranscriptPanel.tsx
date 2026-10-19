import { useId, useState } from "react";
import { formatMediaTime } from "../../lib/workspace";
import type { TranscriptSegment } from "../../lib/workspace-types";

interface Props {
  segments: TranscriptSegment[];
  demo: boolean;
  onSeek: (time: number) => void;
  onText: (id: string, text: string) => void;
  currentTime: number;
  canSeek: boolean;
}

export function TranscriptPanel({ segments, demo, onSeek, onText, currentTime, canSeek }: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const id = useId();
  const visible = segments.filter((segment) => segment.text.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  return (
    <section className="transcript-panel" aria-labelledby={`${id}-heading`}>
      <header><h2 id={`${id}-heading`}>Transcrição</h2>{demo && <span className="flow-demo-label">Demonstração</span>}</header>
      {demo && <p className="flow-muted">Texto de exemplo. Não foi extraído do seu vídeo.</p>}
      <label className="upload-sr-only" htmlFor={`${id}-search`}>Buscar na transcrição</label>
      <input id={`${id}-search`} className="flow-input" type="search" value={query} placeholder="Buscar palavras ou trechos…"
        onChange={(event) => setQuery(event.target.value)} />
      {!segments.length ? <p className="flow-muted">Nenhuma transcrição ainda. A geração ficará disponível com a integração do motor de IA.</p>
        : !visible.length ? <p className="flow-muted" role="status">Nenhum trecho encontrado.</p>
        : <ol className="transcript-segments">{visible.map((segment) => <li key={segment.id}
          data-active={currentTime >= segment.start && currentTime < segment.end}>
          <div><button className="transcript-time" type="button" disabled={!canSeek} onClick={() => onSeek(segment.start)}
            aria-label={`Ir para ${formatMediaTime(segment.start)}`}>{formatMediaTime(segment.start)}</button>
            <button type="button" className="flow-text-button" onClick={() => setEditing(editing === segment.id ? null : segment.id)}>
              {editing === segment.id ? "Concluir" : "Editar trecho"}</button></div>
          {editing === segment.id ? <label className="transcript-edit">Texto do trecho<textarea value={segment.text} maxLength={2000}
            onChange={(event) => onText(segment.id, event.target.value)} /></label> : <p>{segment.text}</p>}
        </li>)}</ol>}
    </section>
  );
}
