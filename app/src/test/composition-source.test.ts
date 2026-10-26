import { describe, expect, it } from "vitest";
import { fragmentFromAsset } from "../lib/composition-source";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
describe("inserção da fonte",()=>{
  it("insere vídeo, áudio e legendas vinculados apenas ao intervalo marcado",()=>{
    const data=emptyWorkspace();data.media={kind:"local",name:"source.mp4",mediaId:"source",duration:60,width:1920,height:1080,videoId:null,url:null};
    data.transcript=[{id:"fala",start:10,end:12,text:"Olá"}];
    const doc=compositionFromLegacy(data);
    const fragment=fragmentFromAsset(doc,doc.assets[0],10,12);
    expect(fragment.items.map(item=>item.kind)).toEqual(["video","audio","caption"]);
    expect(new Set(fragment.items.map(item=>item.groupId)).size).toBe(1);
    expect(fragment.items.every(item=>item.durationFrames===60 && item.sourceStartUs===10_000_000 && item.startFrame===0)).toBe(true);
    expect(()=>fragmentFromAsset(doc,doc.assets[0],20,61)).toThrow();
  });
  it("imagem começa com cinco segundos e não inventa áudio",()=>{
    const doc=compositionFromLegacy(emptyWorkspace());
    const fragment=fragmentFromAsset(doc,{id:"image",mediaId:"image",name:"image.png",kind:"image",durationUs:0,width:500,height:500,transcript:[]});
    expect(fragment.items).toHaveLength(1);
    expect(fragment.items[0].durationFrames).toBe(150);
    expect(fragment.items[0].sourceEndUs).toBe(0);
  });
});
