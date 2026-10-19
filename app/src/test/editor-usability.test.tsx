import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { transcriptSections } from "../lib/transcript-sections";
import { displayWords, replaceTranscriptWord } from "../lib/transcript-text";
import { suppressNativeContextMenu } from "../lib/context-menu";
import { waveformEnvelope } from "../lib/waveform";
import { TranscriptionDialog } from "../components/workspace/TranscriptionDialog";
import { ProjectDeleteButton } from "../components/workspace/ProjectDeleteButton";
import type { TranscriptSegment } from "../lib/workspace-types";

const noop = () => {};
const phrase: TranscriptSegment = { id:"one", start:0,end:6,text:"Olá *risos* mundo agora",words:[
  {text:"Olá",start:0.1,end:0.5},{text:"mundo",start:2,end:3},{text:"agora",start:4,end:5},
] };

describe("correções de uso do editor", () => {
  it("não perde palavras posteriores a um ruído ou diferença lexical", () => {
    expect(displayWords(phrase).map(word => word.start)).toEqual([0.1,null,2,4]);
  });
  it("mantém a navegação por palavra depois da correção e persiste intervalos", () => {
    const next = replaceTranscriptWord(phrase,2,"pessoal");
    const reloaded = JSON.parse(JSON.stringify(next)) as TranscriptSegment;
    expect(reloaded.text).toBe("Olá *risos* pessoal agora");
    expect(displayWords(reloaded)[2]).toMatchObject({text:"pessoal",start:2,end:3});
    expect(displayWords(reloaded)[3].start).toBe(4);
  });
  it("rejeita substituição vazia ou com duas palavras sem apagar a transcrição", () => {
    expect(replaceTranscriptWord(phrase,0," ")).toBe(phrase);
    expect(replaceTranscriptWord(phrase,0,"duas palavras")).toBe(phrase);
  });
  it("cada seção tem conteúdo próprio, cabeçalho extraído e limite de duração", () => {
    const segments = Array.from({length:120},(_,i) => ({id:String(i),start:i*5,end:i*5+4,text:`Fala ${i}.`}));
    const groups = transcriptSections(segments);
    expect(groups.length).toBeGreaterThan(6);
    expect(groups.flatMap(group => group.segments)).toEqual(segments);
    expect(groups.every(group => group.end-group.start <= 90)).toBe(true);
    expect(groups[0].title).toBe("Fala 0.");
  });
  it("usa pausas para separar seções sem criar títulos fictícios", () => {
    const groups=transcriptSections([{...phrase,start:0,end:33},{...phrase,id:"two",start:36,end:42,text:"Um novo assunto."}]);
    expect(groups).toHaveLength(2);
    expect(groups[1].title).toBe("Um novo assunto.");
    expect(transcriptSections([])).toEqual([]);
  });
  it("bloqueia somente o menu padrão e preserva o evento para menus do app", () => {
    const target = new EventTarget();
    let called = 0;
    target.addEventListener("contextmenu", () => called++);
    const restore = suppressNativeContextMenu(target);
    const event = new Event("contextmenu",{cancelable:true});
    expect(target.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(called).toBe(1);
    restore();
    expect(target.dispatchEvent(new Event("contextmenu",{cancelable:true}))).toBe(true);
  });
  it("preserva silêncio e amplitudes reais ao desenhar em larguras diferentes", () => {
    expect(waveformEnvelope([0,0,0,0],2)).toEqual([0,0]);
    expect(waveformEnvelope([0,.25,1,.5],2)).toEqual([.25,1]);
    expect(waveformEnvelope([0,.25,1,.5],400)).toEqual([0,.25,1,.5]);
    expect(waveformEnvelope([],400)).toEqual([]);
  });
  it("Cancelar usa a ação branca centralizada solicitada", () => {
    const html=renderToStaticMarkup(<TranscriptionDialog open job={{jobId:"j",projectId:"p",state:"running",stage:"transcribing",progress:93,error:null}} onClose={noop} onCancel={async()=>true} onRetry={noop}/>);
    expect(html).toContain('class="upload-primary flow-wide processing-cancel"');
    expect(html).not.toContain("upload-ghost");
    expect(html).not.toMatch(/Whisper|DTW|modelo|migração|CPU/);
  });
  it("oferece exclusão explícita em um botão separado do card", () => {
    const html=renderToStaticMarkup(<ProjectDeleteButton compact name="Meu vídeo" onDelete={async()=>{}}/>);
    expect(html).toContain('aria-label="Excluir projeto Meu vídeo"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain('role="dialog"');
  });
});
