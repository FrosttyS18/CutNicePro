import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ClipGallery } from "../components/clips/ClipGallery";
import { mergeEditorClips, visibleClips, type LibraryClip } from "../lib/clip-library";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("../components/clips/ClipPoster",()=>({ClipPoster:()=> <span>Miniatura</span>}));
const now=Date.now();
const entry:LibraryClip={project:{id:"p",name:"Projeto",created_at_ms:1,updated_at_ms:1,last_opened_at_ms:null},mediaId:"source",
  clip:{id:"a".repeat(64),start:0,end:5,title:"Trecho",score:80,reasons:[],review:"rejected",createdAtMs:now-86400000}};
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;vi.useRealTimers();});

it("mantém rejeitados antigos ativos e oferece somente Ativos, Todos e Lixeira",async()=>{
  expect(visibleClips([entry],"active","score")).toHaveLength(1);
  view=await reactHost(<ClipGallery entries={[entry]} onInspect={vi.fn()}/>);
  const options=[...view.host.querySelectorAll('[aria-label="Filtrar clipes"] [role="option"]')].map(element=>element.textContent);
  expect(options).toEqual(["Ativos","Todos","Lixeira"]);
  expect(view.host.querySelector(".clip-card__meta")?.textContent).not.toMatch(/Aprovado|Rejeitado|Para revisar/);
});

it("confirma exclusão permanente no padrão do projeto e permite cancelar sem operação",async()=>{
  const purge=vi.fn(async(_entry:LibraryClip)=>{});
  view=await reactHost(<ClipGallery entries={[{...entry,clip:{...entry.clip,deleted:true,deletedAtMs:now}}]} onInspect={vi.fn()} onPurge={purge} onRestore={vi.fn()}/>);
  await view.chooseOption("Filtrar clipes","Lixeira");
  expect(view.host.textContent).toContain("7 dias");
  const action=view.host.querySelector<HTMLButtonElement>('[aria-label="Excluir permanentemente"]')!;
  expect(action).not.toBeNull();
  await act(async()=>action.click());
  const modal=view.host.querySelector<HTMLDialogElement>("dialog")!;
  expect(modal.open).toBe(true);
  expect(modal.textContent).toContain("O vídeo original e os arquivos exportados serão mantidos.");
  expect(modal.querySelector('.dialog-action--danger')).not.toBeNull();
  expect(modal.querySelector('.dialog-action--secondary')).not.toBeNull();
  await view.click("Cancelar");expect(purge).not.toHaveBeenCalled();
  await act(async()=>action.click());
  await act(async()=>view!.host.querySelector<HTMLButtonElement>('dialog .dialog-action--danger')!.click());
  expect(purge).toHaveBeenCalledOnce();expect(purge.mock.calls[0][0].clip.id).toBe(entry.clip.id);
});

it("falha na exclusão mantém a confirmação aberta para tentar novamente",async()=>{
  const purge=vi.fn(async()=>{throw new Error("disco indisponível");});
  view=await reactHost(<ClipGallery entries={[{...entry,clip:{...entry.clip,deleted:true,deletedAtMs:now}}]} onInspect={vi.fn()} onPurge={purge}/>);
  await view.chooseOption("Filtrar clipes","Lixeira");
  await act(async()=>view!.host.querySelector<HTMLButtonElement>('[aria-label="Excluir permanentemente"]')!.click());
  await act(async()=>view!.host.querySelector<HTMLButtonElement>('dialog .dialog-action--danger')!.click());
  expect(view.host.querySelector("dialog[open]")).not.toBeNull();
  expect(view.host.querySelector('dialog [role="alert"]')?.textContent).toContain("Não foi possível");
});

it("edição salva hoje renova Novo e o tempo sem substituir a criação original",async()=>{
  const legacy=emptyWorkspace();legacy.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:5,width:160,height:90,videoId:null,url:null};
  const document=compositionFromLegacy(legacy,{hasAudio:false});
  const entries=mergeEditorClips(entry.project,{version:1,mediaId:"source",transcriptHash:"h",clips:[entry.clip]},
    {version:1,project:null,clips:{[entry.clip.id]:{document,manuallyEdited:true,editedAtMs:now-30000}}});
  view=await reactHost(<ClipGallery entries={entries} onInspect={vi.fn()}/>);
  expect(view.host.querySelector('[aria-label="Novo clipe"]')).not.toBeNull();
  expect(view.host.querySelector(".clip-card__when")?.textContent).toBe("Agora");
  expect(entries[0].clip.createdAtMs).toBe(now-86400000);
});
