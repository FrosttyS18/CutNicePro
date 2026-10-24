import { describe,expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { pointerTime,keyboardTime,beginPointer,movePointer } from "../lib/timeline";
import { cleanTranscriptText,activeWord,alignedWords,editTranscriptSegment } from "../lib/transcript-text";
import { parseTranscript } from "../lib/transcription";
import { TranscriptPanel } from "../components/workspace/TranscriptPanel";
import { TranscriptSentence } from "../components/workspace/TranscriptSentence";
import { TimelineSurface } from "../components/editor/TimelineSurface";
import { defaultEditorSettings } from "../lib/workspace";
import type { TranscriptSegment } from "../lib/workspace-types";

const segment:TranscriptSegment={id:"s",start:0,end:3,text:"-Olá, mundo!",words:[{text:"Olá",start:.1,end:.6},{text:"mundo",start:1.2,end:1.8}]};
const noop=()=>{};
describe("transcrição, tempo e navegação",()=>{
  it("limpa apenas marcadores de diálogo preservando hifens e números",()=>{
    expect(cleanTranscriptText("-Olá, -mundo! pós-graduação -10 — sim")).toBe("Olá, mundo! pós-graduação -10 sim");
  });
  it("ilumina somente intervalos de palavra reais e respeita pausas",()=>{
    expect(activeWord(segment.words,.3)).toBe(0);
    expect(activeWord(segment.words,.9)).toBe(-1);
    expect(activeWord(segment.words,1.3)).toBe(1);
    expect(activeWord(undefined,1)).toBe(-1);
  });
  it("preserva pontuação do texto e não força alinhamento de palavras diferentes",()=>{
    expect(alignedWords(segment)?.[0].text).toBe("Olá,");
    expect(alignedWords({...segment,text:"Outro texto"})).toBeUndefined();
    expect(editTranscriptSegment(segment,"Correção").words).toBeUndefined();
  });
  it("aceita legado sem palavras e rejeita palavras fora do próprio trecho",()=>{
    const record={version:1,mediaId:"m",model:"small",language:"pt",segments:[segment]};
    expect(parseTranscript(record).segments[0].words).toHaveLength(2);
    expect(()=>parseTranscript({...record,segments:[{...segment,words:[{text:"fora",start:0,end:4}]}]})).toThrow();
    expect(parseTranscript({...record,segments:[{id:"old",start:0,end:1,text:"Legado"}]}).segments).toHaveLength(1);
  });
  it("recolhe as seções em região própria e destaca uma única palavra quando abertas",()=>{
    const html=renderToStaticMarkup(<TranscriptPanel segments={[segment]} demo={false} generated currentTime={0} canSeek onSeek={noop} onText={noop}/>);
    expect(html).toContain('class="transcript-scroll"');
    expect(html).toContain('aria-label="Texto da transcrição"');
    expect(html).toContain('aria-expanded="false"');
    const playing=renderToStaticMarkup(<TranscriptPanel segments={[segment]} demo={false} generated currentTime={1.3} canSeek onSeek={noop} onText={noop}/>);
    expect(playing).toContain('aria-expanded="true"');
    expect(playing.match(/aria-current="true"/g)).toHaveLength(1);
    const sentence=renderToStaticMarkup(<TranscriptSentence segment={segment} activeIndex={1} canSeek readOnly={false} editing={false} onSeek={noop} onEdit={noop} onText={noop}/>);
    expect(sentence.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).not.toContain("-Olá");
    expect(html).not.toContain("transcript-segments");
    expect(html).not.toMatch(/Whisper|migração|tempos por palavra|ganhar tempos|modelo maior/);
  });
  it("aplica coordenadas da área inteira com clamp fora da timeline",()=>{
    expect(pointerTime(150,100,200,60)).toBe(15);
    expect(pointerTime(-100,100,200,60)).toBe(0);
    expect(pointerTime(900,100,200,60)).toBe(60);
    expect(pointerTime(10,0,0,60)).toBe(0);
    expect(keyboardTime("End",1,60,false)).toBe(60);
    expect(keyboardTime("ArrowLeft",1,60,true)).toBe(0);
  });
  it("captura o ponteiro e continua buscando quando sai da faixa",()=>{
    const captured=new Set<number>();
    const surface={focus:vi.fn(),setPointerCapture:(id:number)=>captured.add(id),hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:(id:number)=>captured.delete(id),
      getBoundingClientRect:()=>({x:100,y:0,left:100,right:300,top:0,bottom:80,width:200,height:80,toJSON:()=>({})})};
    const seek=vi.fn();
    beginPointer(surface,7,150,60,seek);
    expect(captured.has(7)).toBe(true);
    movePointer(surface,7,500,60,seek);
    expect(seek).toHaveBeenLastCalledWith(60);
    movePointer(surface,7,-200,60,seek);
    expect(seek).toHaveBeenLastCalledWith(0);
    surface.releasePointerCapture(7);
    seek.mockClear(); movePointer(surface,7,200,60,seek);
    expect(seek).not.toHaveBeenCalled();
  });
  it("renderiza régua, miniatura, faixa de áudio e cursor no mesmo slider",()=>{
    const html=renderToStaticMarkup(<TimelineSurface duration={60} time={15} canPlay frames={["blob:real-frame"]} peaks={[0,.5,1]} loading={false} hasAudio settings={defaultEditorSettings()} onSeek={noop}/>);
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuenow="15"');
    expect(html).toContain('src="blob:real-frame"');
    expect(html).toContain('class="timeline-audio"');
    expect(html).toContain('class="timeline-playhead"');
    expect(html).toContain('class="timeline-waveform"');
  });
});
