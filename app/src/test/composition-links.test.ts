import { describe, expect, it, vi } from "vitest";
import { detachAudio, setItemFollowsMain } from "../lib/composition-links";
import { linkedSelection } from "../lib/composition-operations";
import { splitSelection } from "../lib/composition-edit";
import { trimSelection } from "../lib/composition-trim";
import { moveSelection } from "../lib/composition-insert";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { CompositionSession } from "../lib/composition-session";
import { emptyWorkspace } from "../lib/workspace";

function fixture(){const data=emptyWorkspace();data.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};return compositionFromLegacy(data);}
describe("desvincular áudio",()=>{
  it("não altera sincronismo em faixa bloqueada nem fixa a faixa principal",()=>{
    const document=fixture();const audio=document.items.find(item=>item.kind==="audio")!;
    const before=structuredClone(document);
    document.tracks.find(track=>track.id===audio.trackId)!.locked=true;
    expect(()=>setItemFollowsMain(document,audio.id,false)).toThrow(/bloqueada/);
    expect(document.items).toEqual(before.items);
    expect(()=>setItemFollowsMain(document,document.items[0].id,false)).toThrow(/principal/);
    document.tracks.find(track=>track.id===audio.trackId)!.locked=false;
    const session=new CompositionSession(document,{save:vi.fn()});session.apply(setItemFollowsMain(document,audio.id,false));
    expect(session.document.items.find(item=>item.id===audio.id)?.followsMain).toBe(false);
    session.undo();expect(session.document).toEqual(document);
  });
  it("seleção do vídeo desvincula áudio sem modificar identidades, tempo e ajustes",()=>{
    const document=fixture();const video=document.items.find(item=>item.kind==="video")!;const audio=document.items.find(item=>item.kind==="audio")!;
    audio.settings.volume=.4;audio.settings.muted=true;const original=structuredClone(document);
    const next=detachAudio(document,[video.id]);const result=next.items.find(item=>item.id===audio.id)!;
    expect(result.groupId).not.toBe(video.groupId);expect({...result,groupId:audio.groupId}).toEqual(audio);
    expect(next.items.find(item=>item.id===video.id)).toBe(video);expect(next.assets).toBe(document.assets);expect(document).toEqual(original);
    expect(linkedSelection(next,[audio.id]).map(item=>item.id)).toEqual([audio.id]);
    expect(linkedSelection(next,[video.id]).map(item=>item.id)).toEqual([video.id]);
  });
  it("trim, split e movimento do áudio passam a preservar o vídeo",()=>{
    const document=fixture();const audio=document.items.find(item=>item.kind==="audio")!;const video=document.items.find(item=>item.kind==="video")!;
    const detached=detachAudio(document,[audio.id]);
    const trimmed=trimSelection(detached,audio.id,"end",-30);expect(trimmed.items.find(item=>item.id===video.id)).toEqual(video);
    const split=splitSelection(detached,[audio.id],30);expect(split.items.filter(item=>item.kind==="audio")).toHaveLength(2);expect(split.items.find(item=>item.id===video.id)).toEqual(video);
    const moved=moveSelection(detached,[audio.id],30);expect(moved.items.find(item=>item.id===audio.id)?.startFrame).toBe(30);expect(moved.items.find(item=>item.id===video.id)).toEqual(video);
  });
  it("respeita bloqueio do áudio, não altera seleção vazia e desfaz em uma operação",()=>{
    const document=fixture();const audio=document.items.find(item=>item.kind==="audio")!;
    const session=new CompositionSession(document,{save:vi.fn()});session.apply(detachAudio(session.document,[audio.id]));expect(session.canUndo).toBe(true);
    session.undo();expect(session.document).toEqual(document);expect(session.canUndo).toBe(false);
    expect(detachAudio(document,[])).toBe(document);
    document.tracks.find(track=>track.id===audio.trackId)!.locked=true;expect(()=>detachAudio(document,[audio.id])).toThrow(/bloqueada/);
  });
});
