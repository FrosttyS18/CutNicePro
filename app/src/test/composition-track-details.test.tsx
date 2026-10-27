import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTrackDetails } from "../components/editor/CompositionTrackDetails";
import { markerColors } from "../lib/composition-markers";
import type { CompositionTrack } from "../lib/composition-types";
import { reactHost } from "./react-host";

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});

async function mount(track:CompositionTrack={id:"V1",name:"Principal",kind:"visual",primary:true,hidden:false,locked:false,muted:false}){
  const change=vi.fn(),close=vi.fn();
  function Harness(){
    const [open,setOpen]=useState(true);
    return open?<CompositionTrackDetails track={track} x={100} y={100} onChange={change} onClose={()=>{close();setOpen(false);}}/>:null;
  }
  view=await reactHost(<Harness/>);
  return {change,close};
}

async function name(value:string){
  const input=document.querySelector<HTMLInputElement>('[aria-label="Nome da faixa"]')!;
  await act(async()=>{
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value")!.set!.call(input,value);
    input.dispatchEvent(new window.Event("input",{bubbles:true}));
  });
}

function submit(){
  return act(async()=>document.querySelector<HTMLFormElement>(".composition-track-details")!.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true})));
}

it("edita nome e cor locais e confirma uma única alteração no botão Concluir",async()=>{
  const {change,close}=await mount();
  expect(document.querySelectorAll('[aria-label="Cor da faixa"] button')).toHaveLength(5);
  await name("  Entrevista  ");
  const color=document.querySelector<HTMLButtonElement>(`[aria-label="Cor ${markerColors[2]}"]`)!;
  await act(async()=>color.click());
  expect(change).not.toHaveBeenCalled();
  expect(color.getAttribute("aria-pressed")).toBe("true");
  await submit();
  expect(change).toHaveBeenCalledOnce();
  expect(change).toHaveBeenCalledWith({name:"Entrevista",color:markerColors[2]});
  expect(close).toHaveBeenCalledOnce();
});

it.each(["Escape","outside"])("%s descarta nome e cor sem alterar o documento",async(method)=>{
  const {change,close}=await mount();
  await name("Nome temporário");
  await act(async()=>document.querySelector<HTMLButtonElement>(`[aria-label="Cor ${markerColors[1]}"]`)!.click());
  await act(async()=>{
    if(method==="Escape")document.activeElement!.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    else document.body.dispatchEvent(new window.MouseEvent("pointerdown",{bubbles:true}));
  });
  expect(change).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(document.querySelector(".composition-track-details")).toBeNull();
});

it("preserva cor ausente, recusa nome vazio e limita digitação a 120 caracteres Unicode",async()=>{
  const {change,close}=await mount();
  await name("   ");await submit();
  expect(change).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("nome");
  await name("Á".repeat(121));
  expect(document.querySelector<HTMLInputElement>('[aria-label="Nome da faixa"]')!.value).toBe("Á".repeat(120));
  expect(document.querySelector('.editor-name-field__count')?.textContent).toBe("120/120 caracteres");
  expect(change).not.toHaveBeenCalled();
  await name("𠮷".repeat(120));await submit();
  expect(change).toHaveBeenCalledOnce();
  expect(change).toHaveBeenCalledWith({name:"𠮷".repeat(120)});
});

it("mantém uma cor personalizada salva quando somente o nome muda",async()=>{
  const {change}=await mount({id:"overlay",name:"Sobreposição",kind:"visual",primary:false,hidden:false,locked:false,muted:false,color:"#79B8FF"});
  await name("Detalhe");await submit();
  expect(change).toHaveBeenCalledOnce();
  expect(change).toHaveBeenCalledWith({name:"Detalhe",color:"#79B8FF"});
});

it("exibe tentativa de HTML como texto no campo sem criar elementos executáveis",async()=>{
  const payload='<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const {change}=await mount();await name(payload);
  expect(document.querySelector<HTMLInputElement>('[aria-label="Nome da faixa"]')!.value).toBe(payload);
  expect(document.querySelector('.composition-track-details')!.querySelector('img,script')).toBeNull();
  await submit();expect(change).toHaveBeenCalledWith({name:payload});
});
