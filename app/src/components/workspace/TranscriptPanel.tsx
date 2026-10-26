import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { displayWords } from "../../lib/transcript-text";
import { transcriptSections } from "../../lib/transcript-sections";
import { formatMediaTime } from "../../lib/workspace";
import { TranscriptSentence } from "./TranscriptSentence";
import type { TranscriptSegment, TranscriptWord } from "../../lib/workspace-types";

interface Props {
  segments: TranscriptSegment[];
  demo: boolean;
  onSeek: (time: number) => void;
  onText: (id: string, text: string, words?: TranscriptWord[]) => void;
  currentTime: number;
  canSeek: boolean;
  actions?: ReactNode;
  generated?: boolean;
  readOnly?: boolean;
  contextKey?: string;
}

export const TranscriptPanel=memo(function TranscriptPanel({ segments, demo, onSeek, onText, currentTime, canSeek, actions, generated, readOnly, contextKey }: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const id = useId();
  const scroll = useRef<HTMLDivElement>(null);
  const manualUntil = useRef(0);
  const sections = useMemo(() => transcriptSections(segments), [segments]);
  const current = segments.find(segment => currentTime >= segment.start && currentTime < segment.end);
  const currentSection = sections.find(section => current && section.segments.some(segment => segment.id === current.id))?.id;
  const activeIndex = current ? displayWords(current).findIndex(word => word.start !== null && word.end !== null && currentTime >= word.start && currentTime < word.end) : -1;
  const activeKey = `${current?.id}:${activeIndex}`;
  const started = currentTime > 0;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(currentSection && started ? [currentSection] : contextKey && sections[0] ? [sections[0].id] : []));
  const [followed,setFollowed] = useState({currentSection,started,contextKey});
  if (followed.currentSection !== currentSection || followed.started !== started || followed.contextKey !== contextKey) {
    setFollowed({currentSection,started,contextKey});
    if (currentSection && started) setExpanded(new Set([currentSection]));
    else if(followed.contextKey!==contextKey) setExpanded(new Set(sections[0]?[sections[0].id]:[]));
    if(followed.contextKey!==contextKey) setEditing(null);
  }
  useEffect(() => {
    const box = scroll.current;
    const active = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !active || Date.now() < manualUntil.current) return;
    const parent = box.getBoundingClientRect();
    const child = active.getBoundingClientRect();
    if (child.bottom > parent.bottom || child.top < parent.top) box.scrollTop += child.top - parent.top - 30;
  }, [activeKey]);
  const callbacks = useRef({ onSeek, onText });
  useLayoutEffect(() => { callbacks.current = { onSeek, onText }; }, [onSeek,onText]);
  const seek = useCallback((time: number) => callbacks.current.onSeek(time), []);
  const text = useCallback((key: string, value: string, words?: TranscriptWord[]) => callbacks.current.onText(key, value, words), []);
  const edit = useCallback((key: string) => setEditing(current => current === key ? null : key), []);
  const search = query.trim().toLocaleLowerCase("pt-BR");
  const visible = useMemo(()=>sections.filter(section => section.segments.some(segment => segment.text.toLocaleLowerCase("pt-BR").includes(search))),[sections,search]);
  return <section className="transcript-panel" aria-labelledby={`${id}-heading`}>
    <header><h2 id={`${id}-heading`}>Transcrição</h2></header>
    {actions}
    {demo && <p className="flow-muted">Texto de exemplo.</p>}
    <label className="upload-sr-only" htmlFor={`${id}-search`}>Buscar na transcrição</label>
    <input id={`${id}-search`} className="flow-input" type="search" value={query} placeholder="Buscar palavras ou trechos…" onChange={event => setQuery(event.target.value)} />
    <div ref={scroll} className="transcript-scroll" role="region" aria-label="Texto da transcrição" tabIndex={0}
      onWheel={() => { manualUntil.current = Date.now() + 4000; }} onPointerDown={() => { manualUntil.current = Date.now() + 4000; }}>
      {!segments.length ? <p className="flow-muted">{generated ? "Nenhum trecho de fala foi identificado neste vídeo." : "Ainda não há transcrição para este vídeo."}</p>
        : !visible.length ? <p className="flow-muted" role="status">Nenhum trecho encontrado.</p>
        : visible.map(section => {
          const open = Boolean(search) || expanded.has(section.id);
          const bodyId = `${id}-${section.id}`;
          return <section className="transcript-section" key={section.id}>
            <h3><button type="button" className="transcript-section__toggle" aria-expanded={open} aria-controls={bodyId}
              onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(section.id)) next.delete(section.id); else next.add(section.id); return next; })}>
              <span>{section.title}</span><small>{formatMediaTime(section.end - section.start)}</small>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>
            </button></h3>
            <div id={bodyId} hidden={!open}>{open && <div className="transcript-document">
              {section.segments.map(segment => <TranscriptSentence key={segment.id} segment={segment}
                activeIndex={segment.id === current?.id ? activeIndex : -1} canSeek={canSeek} readOnly={Boolean(readOnly)}
                editing={editing === segment.id} onSeek={seek} onEdit={edit} onText={text} />)}
            </div>}</div>
          </section>;
        })}
    </div>
  </section>;
});
