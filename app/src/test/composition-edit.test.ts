import { describe, expect, it } from "vitest";
import { emptyWorkspace } from "../lib/workspace";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { compositionDuration, validateComposition } from "../lib/composition";
import { splitSelection, removeRange, removeSelection } from "../lib/composition-edit";
import { duplicateSelection, insertComposition, extractComposition, moveSelection } from "../lib/composition-insert";
import { trimSelection } from "../lib/composition-trim";

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 100, width: 1920, height: 1080, videoId: null, url: null };
  workspace.settings.trimStart = 10;
  workspace.settings.trimEnd = 20;
  workspace.transcript = [{ id: "s1", start: 10, end: 20, text: "Texto original" }];
  return compositionFromLegacy(workspace);
}

describe("comandos da montagem", () => {
  it("move também um elemento independente selecionado fora da janela principal",()=>{
    const document=duplicateSelection(fixture(),[fixture().items[0].id],"sequence");
    document.tracks.push({id:"V2",name:"Sobreposição",kind:"visual",primary:false,locked:false,hidden:false,muted:false});
    const main=document.items.find(item=>item.kind==="video"&&item.startFrame===300)!;
    document.items.push({...structuredClone(document.items[0]),id:"overlay",groupId:"overlay",trackId:"V2",followsMain:false,startFrame:0,durationFrames:30,sourceEndUs:11_000_000});
    const next=moveSelection(document,[main.id,"overlay"],600);
    expect(next.items.find(item=>item.id==="overlay")?.startFrame).toBe(300);
    expect(next.items.find(item=>item.id===main.id)?.startFrame).toBe(600);
    expect(validateComposition(next)).toEqual([]);
  });
  it("divide vídeo, áudio e legenda vinculados sem mudar duração", () => {
    const document = fixture();
    const original = JSON.stringify(document);
    const next = splitSelection(document, [document.items[0].id], 150);
    expect(next.items).toHaveLength(6);
    expect(next.items.filter(item => item.kind === "video").map(item => [item.startFrame, item.durationFrames, item.sourceStartUs, item.sourceEndUs]))
      .toEqual([[0, 150, 10_000_000, 15_000_000], [150, 150, 15_000_000, 20_000_000]]);
    expect(compositionDuration(next)).toBe(300);
    expect(validateComposition(next)).toEqual([]);
    expect(JSON.stringify(document)).toBe(original);
  });

  it("não cria itens vazios ao dividir na extremidade", () => {
    const document = fixture();
    expect(splitSelection(document, [document.items[0].id], 0)).toBe(document);
    expect(splitSelection(document, [document.items[0].id], 300)).toBe(document);
  });

  it("remove parte interna fechando o espaço em todas as faixas associadas", () => {
    const next = removeRange(fixture(), 60, 120, true);
    expect(compositionDuration(next)).toBe(240);
    for (const kind of ["video", "audio", "caption"]) {
      expect(next.items.filter(item => item.kind === kind).map(item => [item.startFrame, item.durationFrames, item.sourceStartUs, item.sourceEndUs]))
        .toEqual([[0, 60, 10_000_000, 12_000_000], [60, 180, 14_000_000, 20_000_000]]);
    }
    expect(validateComposition(next)).toEqual([]);
  });

  it("oferece remoção mantendo o espaço", () => {
    const next = removeRange(fixture(), 60, 120, false);
    expect(compositionDuration(next)).toBe(300);
    expect(next.items.filter(item => item.kind === "video").map(item => item.startFrame)).toEqual([0, 120]);
  });

  it("reposiciona corretamente o fim de uma sobreposição que começa dentro da remoção", () => {
    const document = fixture();
    document.tracks.push({ ...document.tracks[0], id: "V2", name: "Sobreposição", primary: false });
    document.items.push({ ...structuredClone(document.items[0]), id: "overlay", trackId: "V2", groupId: "overlay-group", startFrame: 60, durationFrames: 90, sourceEndUs: 13_000_000 });
    const next = removeRange(document, 30, 120, true);
    const overlay = next.items.find(item => item.id === "overlay")!;
    expect([overlay.startFrame, overlay.durationFrames, overlay.sourceStartUs]).toEqual([30, 30, 12_000_000]);
  });

  it("reordena blocos e vínculos sem trocar a identidade dos itens movidos", () => {
    const document = duplicateSelection(fixture(), [fixture().items[0].id], "sequence");
    const videos = document.items.filter(item => item.kind === "video").sort((a,b)=>a.startFrame-b.startFrame);
    const second = videos[1];
    const next = moveSelection(document, [second.id], 0);
    expect(next.items.filter(item => item.kind === "video").sort((a,b)=>a.startFrame-b.startFrame).map(item => item.id)).toEqual([second.id, videos[0].id]);
    expect(compositionDuration(next)).toBe(600);
    expect(validateComposition(next)).toEqual([]);
  });

  it("preserva elementos fixos e impede alterar uma faixa bloqueada", () => {
    const document = fixture();
    document.items.find(item => item.kind === "audio")!.followsMain = false;
    const next = removeRange(document, 60, 120, true);
    expect(next.items.find(item => item.kind === "audio")!.durationFrames).toBe(300);
    document.tracks.find(track => track.id === "C1")!.locked = true;
    expect(() => removeRange(document, 60, 120, true)).toThrow(/bloqueada/);
    expect(compositionDuration(document)).toBe(300);
  });

  it("permite remover o último grupo e salvar montagem vazia", () => {
    const document = fixture();
    const next = removeSelection(document, [document.items[0].id]);
    expect(next.items).toHaveLength(0);
    expect(validateComposition(next)).toEqual([]);
  });

  it("duplica com identidade própria e preserva áudio, legenda e a fonte", () => {
    const document = fixture();
    const next = duplicateSelection(document, [document.items[0].id]);
    expect(compositionDuration(next)).toBe(300);
    expect(next.items).toHaveLength(6);
    expect(new Set(next.items.map(item => item.id)).size).toBe(6);
    expect(next.assets).toHaveLength(1);
    expect(validateComposition(next)).toEqual([]);
    next.items.filter(item => item.kind === "caption")[1].captionEdits.s1 = "Novo texto";
    expect(document.items.find(item => item.kind === "caption")!.captionEdits).toEqual({});
  });

  it("extrai um intervalo para clipe sem alterar a montagem de origem", () => {
    const document = fixture();
    const next = extractComposition(document, 60, 210);
    expect(compositionDuration(next)).toBe(150);
    expect(next.items.every(item => item.startFrame === 0 && item.sourceStartUs === 12_000_000 && item.sourceEndUs === 17_000_000)).toBe(true);
    expect(compositionDuration(document)).toBe(300);
  });

  it("insere um trecho no meio separando e deslocando conteúdo associado", () => {
    const document = fixture();
    const fragment = extractComposition(document, 0, 60);
    const next = insertComposition(document, fragment, 150);
    expect(compositionDuration(next)).toBe(360);
    expect(next.items.filter(item => item.kind === "video").sort((a,b)=>a.startFrame-b.startFrame).map(item => [item.startFrame, item.durationFrames]))
      .toEqual([[0, 150], [150, 60], [210, 150]]);
    expect(validateComposition(next)).toEqual([]);
  });

  it("estende o início do corte além do intervalo da IA preservando sua extremidade direita", () => {
    const document = fixture();
    document.items = document.items.map(item => ({ ...item, startFrame: 150 }));
    const next = trimSelection(document, document.items[0].id, "start", -150);
    expect(next.items[0].startFrame).toBe(0);
    expect(next.items[0].sourceStartUs).toBe(5_000_000);
    expect(compositionDuration(next)).toBe(450);
    expect(validateComposition(next)).toEqual([]);
  });

  it("recusa trim fora da fonte ou com menos de um frame", () => {
    const document = fixture();
    expect(() => trimSelection(document, document.items[0].id, "start", -301)).toThrow();
    expect(() => trimSelection(document, document.items[0].id, "end", -300)).toThrow();
    expect(() => trimSelection(document, document.items[0].id, "end", 3000)).toThrow();
  });
});
