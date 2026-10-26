import { describe, expect, it } from "vitest";
import { applyCaptionTranscript, applyMontageCaptionStyle, hasCaptionTranscriptUpdate } from "../lib/composition-captions";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { montageTranscript } from "../lib/composition-playback";
import { emptyWorkspace } from "../lib/workspace";
import { captionPresets } from "../lib/captions";

const transcript=[{id:"s",start:1,end:2,text:"Fonte original",words:[{text:"Fonte",start:1,end:1.5},{text:"original",start:1.5,end:2}]}];
function fixture(){const data=emptyWorkspace();data.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};data.settings.trimStart=1;data.settings.trimEnd=3;return compositionFromLegacy(data);}
describe("legendas explícitas na montagem",()=>{
  it("adiciona legendas vinculadas ao recorte sem modificar a fonte ou itens existentes",()=>{
    const document=fixture();document.settings.text="Rascunho";const before=structuredClone(document);
    expect(hasCaptionTranscriptUpdate(document,"source",transcript)).toBe(true);
    const next=applyCaptionTranscript(document,"source",transcript);
    expect(document).toEqual(before);expect(transcript[0].text).toBe("Fonte original");
    const caption=next.items.find(item=>item.kind==="caption")!;
    expect(caption).toMatchObject({startFrame:0,durationFrames:60,sourceStartUs:1_000_000,sourceEndUs:3_000_000,groupId:document.items[0].groupId});
    expect(next.items.filter(item=>item.kind!=="caption")).toEqual(document.items);
    expect(montageTranscript(next)[0].segment).toMatchObject({start:0,end:1,text:"Fonte original"});
    expect(next.settings.text).toBe("Rascunho");expect(hasCaptionTranscriptUpdate(next,"source",transcript)).toBe(false);
    expect(applyCaptionTranscript(next,"source",transcript)).toBe(next);
  });
  it("preserva correções locais e recusa remoção dos IDs aos quais pertencem",()=>{
    const document=applyCaptionTranscript(fixture(),"source",transcript);const caption=document.items.find(item=>item.kind==="caption")!;
    caption.captionEdits.s={text:"Correção local",words:[{text:"Correção",start:1,end:1.4},{text:"local",start:1.4,end:2}]};
    const next=applyCaptionTranscript(document,"source",[{...transcript[0],text:"ASR revisada"}]);
    expect(montageTranscript(next)[0].segment.text).toBe("Correção local");expect(next.items.find(item=>item.id===caption.id)?.captionEdits).toEqual(caption.captionEdits);
    expect(()=>applyCaptionTranscript(document,"source",[{...transcript[0],id:"different"}])).toThrow(/correções locais/);
    expect(document.assets[0].transcript).toEqual(transcript);
  });
  it("respeita bloqueios para itens novos e para captions existentes",()=>{
    const document=fixture();document.tracks.find(track=>track.kind==="caption")!.locked=true;
    expect(()=>applyCaptionTranscript(document,"source",transcript)).toThrow(/bloqueada/);
    expect(document.assets[0].transcript).toEqual([]);
    const existing=applyCaptionTranscript(fixture(),"source",transcript);existing.tracks.find(track=>track.kind==="caption")!.locked=true;
    expect(()=>applyCaptionTranscript(existing,"source",[{...transcript[0],text:"Atualizada"}])).toThrow(/bloqueada/);
  });
  it("aplica estilo somente à montagem e preserva textos locais e demais ajustes",()=>{
    const document=applyCaptionTranscript(fixture(),"source",transcript);document.items.find(item=>item.kind==="caption")!.captionEdits.s="Correção";
    const next=applyMontageCaptionStyle(document,3,captionPresets[3].style);
    expect(next.items.every(item=>item.settings.captionModel===3)).toBe(true);expect(next.settings.captionModel).toBe(3);
    expect(montageTranscript(next)[0].segment.text).toBe("Correção");expect(next.assets).toBe(document.assets);
    document.tracks.find(track=>track.kind==="caption")!.locked=true;
    expect(()=>applyMontageCaptionStyle(document,2,captionPresets[2].style)).toThrow(/bloqueada/);
  });
});
