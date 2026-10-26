import { describe, expect, it } from "vitest";
import { emptyWorkspace } from "../lib/workspace";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { duplicateSelection } from "../lib/composition-insert";
import { activeItems, linkedSourceAudio, sourceTimeAt, sourceVideoForAudio, montageTranscript } from "../lib/composition-playback";

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 60, width: 1920, height: 1080, videoId: null, url: null };
  workspace.settings.trimStart = 10; workspace.settings.trimEnd = 12;
  workspace.transcript = [{ id: "s", start: 10, end: 12, text: "Um dois", words: [{ text: "Um", start: 10, end: 11 }, { text: "dois", start: 11, end: 12 }] }];
  return compositionFromLegacy(workspace);
}

describe("tempo da prévia e legenda da montagem", () => {
  it("correção local preserva os tempos de palavras sem alterar outra cópia",()=>{
    const source=fixture();const document=duplicateSelection(source,[source.items[0].id]);
    const caption=document.items.find(item=>item.kind==="caption")!;
    caption.captionEdits[source.assets[0].transcript[0].id]={text:"Olá editado",words:[{text:"Olá",start:10,end:11},{text:"editado",start:11,end:12}]};
    const entries=montageTranscript(document);
    expect(entries[0].segment.text).toBe("Olá editado");
    expect(entries[0].segment.words?.[1]).toEqual({text:"editado",start:1,end:2});
    expect(entries[1].segment.text).not.toBe("Olá editado");
  });
  it("mapeia saída para fonte e muda de item exatamente na junção", () => {
    const source = fixture();
    const document = duplicateSelection(source, [source.items[0].id], "sequence");
    expect(activeItems(document, 59).find(item => item.kind === "video")?.id).toBe(source.items[0].id);
    const second = activeItems(document, 60).find(item => item.kind === "video")!;
    expect(second.id).not.toBe(source.items[0].id);
    expect(sourceTimeAt(second, 60, document.fps)).toBe(10);
    expect(sourceTimeAt(second, 90, document.fps)).toBe(11);
  });
  it("duplica legendas com identidade e tempos próprios sem mudar a transcrição", () => {
    const source = fixture();
    const document = duplicateSelection(source, [source.items[0].id], "sequence");
    const segments = montageTranscript(document);
    expect(segments.map(entry => [entry.segment.start, entry.segment.end])).toEqual([[0, 2], [2, 4]]);
    expect(new Set(segments.map(entry => entry.segment.id)).size).toBe(2);
    expect(segments[1].segment.words?.[0].start).toBe(2);
    expect(source.assets[0].transcript[0].start).toBe(10);
  });
  it("elementos ocultos ou áudio silenciado não entram na reprodução", () => {
    const document = fixture();
    document.tracks.find(track => track.id === "V1")!.hidden = true;
    document.tracks.find(track => track.id === "A1")!.muted = true;
    expect(activeItems(document, 0).map(item => item.kind)).toEqual(["caption"]);
  });
});

describe("áudio original associado ao vídeo",()=>{
  it("silencia somente o áudio ligado à faixa visual sem apagar mutes ou volumes individuais",()=>{
    const document=fixture();
    const video=document.items.find(item=>item.kind==="video")!;
    const audio=document.items.find(item=>item.kind==="audio")!;
    document.items.push({...structuredClone(audio),id:"music",groupId:"independent",followsMain:false});
    audio.settings.volume=.4;
    const before=structuredClone(document.items);
    const visual=document.tracks.find(track=>track.id===video.trackId)!;
    visual.muted=true;
    expect(activeItems(document,0).filter(item=>item.kind==="audio").map(item=>item.id)).toEqual(["music"]);
    visual.muted=false;
    expect(activeItems(document,0).filter(item=>item.kind==="audio").map(item=>item.id)).toEqual([audio.id,"music"]);
    audio.settings.muted=true;
    visual.muted=true;visual.muted=false;
    expect(activeItems(document,0).filter(item=>item.kind==="audio").map(item=>item.id)).toEqual(["music"]);
    expect(document.items).toEqual(before.map(item=>item.id===audio.id?{...item,settings:{...item.settings,muted:true}}:item));
  });

  it("reconhece o par sem alterar a montagem ou o contrato salvo",()=>{
    const document=fixture();const before=JSON.stringify(document);
    const video=document.items.find(item=>item.kind==="video")!;
    const audio=document.items.find(item=>item.kind==="audio")!;
    expect(linkedSourceAudio(document,video)).toBe(audio);
    expect(sourceVideoForAudio(document,audio)).toBe(video);
    expect(JSON.stringify(document)).toBe(before);
  });
  it.each(["hidden","muted","locked"] as const)("mantém faixa de áudio legado %s acessível na timeline",flag=>{
    const document=fixture();document.tracks.find(track=>track.id==="A1")![flag]=true;
    const video=document.items.find(item=>item.kind==="video")!;
    const audio=document.items.find(item=>item.kind==="audio")!;
    expect(linkedSourceAudio(document,video)).toBeUndefined();
    expect(sourceVideoForAudio(document,audio)).toBeUndefined();
  });
  it("não associa áudio fixo, desvinculado ou com recorte diferente",()=>{
    for(const patch of [{followsMain:false},{groupId:"detached"},{sourceStartUs:10_100_000},{durationFrames:59}]){
      const document=fixture();const video=document.items.find(item=>item.kind==="video")!;
      const audio=document.items.find(item=>item.kind==="audio")!;Object.assign(audio,patch);
      expect(linkedSourceAudio(document,video)).toBeUndefined();expect(sourceVideoForAudio(document,audio)).toBeUndefined();
    }
  });
  it("preserva áudio independente quando o pareamento é ambíguo",()=>{
    const document=fixture();const video=document.items.find(item=>item.kind==="video")!;
    const audio=document.items.find(item=>item.kind==="audio")!;
    document.items.push({...structuredClone(video),id:"other-video",trackId:"V2"});
    expect(linkedSourceAudio(document,video)).toBeUndefined();
    expect(sourceVideoForAudio(document,audio)).toBeUndefined();
  });
});
