import { memo, useState } from "react";
import type { TranscriptSegment } from "../../lib/workspace-types";
import { displayWords, replaceTranscriptWord } from "../../lib/transcript-text";
import { TranscriptWordEditor } from "./TranscriptWordEditor";
import { TranscriptWordPopover } from "./TranscriptWordPopover";
import type { TranscriptWord } from "../../lib/workspace-types";
import { formatMediaTime } from "../../lib/workspace";

interface Props {
  segment: TranscriptSegment;
  activeIndex: number;
  canSeek: boolean;
  readOnly: boolean;
  editing: boolean;
  onSeek: (time: number) => void;
  onEdit: (id: string) => void;
  onText: (id: string, text: string, words?: TranscriptWord[]) => void;
}

export const TranscriptSentence = memo(function TranscriptSentence({ segment: s, activeIndex, canSeek, readOnly, editing, onSeek, onEdit, onText }: Props) {
  const words = displayWords(s);
  const [selected, setSelected] = useState<number | null>(null);
  const [wordEditing, setWordEditing] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const close = () => { setSelected(null); setWordEditing(false); };
  return <span className="transcript-sentence">
    {editing ? <span className="transcript-edit"><label htmlFor={`transcript-edit-${s.id}`}>Editar trecho</label><textarea id={`transcript-edit-${s.id}`} value={s.text} maxLength={16000} readOnly={readOnly}
      onChange={event => onText(s.id,event.target.value)} /><button className="flow-button" type="button" onClick={() => onEdit(s.id)}>Concluir</button></span>
      : words.map((word,index) => <span className="transcript-word-wrap" key={index}><button type="button" className="transcript-word"
        aria-current={activeIndex === index ? "true" : undefined} aria-pressed={selected === index}
        onClick={event => { if (canSeek) onSeek(word.start ?? s.start); setAnchor(event.currentTarget); setSelected(index); setWordEditing(false); }}
        onDoubleClick={event => { if (!readOnly) { setAnchor(event.currentTarget); setSelected(index); setWordEditing(true); } }}>{word.text}</button>{" "}
        {selected === index && anchor && !readOnly && <TranscriptWordPopover anchor={anchor} onClose={close}>
          {wordEditing ? <TranscriptWordEditor text={word.text} onClose={close}
          onSave={value => { const next = replaceTranscriptWord(s,index,value); onText(s.id,next.text,next.words); }} />
          : <span className="transcript-word-tools"><button type="button" className="flow-button" onClick={() => setWordEditing(true)}>Editar palavra</button>
            <button type="button" className="flow-button" aria-label="Fechar seleção" onClick={close}>×</button></span>}
        </TranscriptWordPopover>}
      </span>)}
    {!editing && <button type="button" className="transcript-edit-action" disabled={readOnly} onClick={() => onEdit(s.id)}
      aria-label={`Editar trecho em ${formatMediaTime(s.start)}`} title="Editar trecho"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z" /></svg></button>}
  </span>;
});
