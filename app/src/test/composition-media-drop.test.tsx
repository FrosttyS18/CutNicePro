import { act,useRef } from "react";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { useCompositionMediaDrop } from "../hooks/useCompositionMediaDrop";
import type { CompositionTimelineDropController } from "../lib/composition-drop-controller";
import type { CompositionAsset } from "../lib/composition-types";
import { reactHost } from "./react-host";

type Payload={type:"drop"|"enter";position:{x:number;y:number};paths:string[]}|{type:"over";position:{x:number;y:number}}|{type:"leave"};
const native=vi.hoisted(()=>({listen:vi.fn(),off:vi.fn()}));
vi.mock("../lib/native-media-drop",()=>({subscribeNativeMediaDrop:async(callback:(event:{payload:Payload})=>void,signal:AbortSignal)=>{
  const off=await native.listen(callback);if(signal.aborted){await off();return;}
  signal.addEventListener("abort",()=>{void Promise.resolve().then(()=>off()).catch(()=>undefined);},{once:true});
}}));
let listener:(event:{payload:Payload})=>void;
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
const asset:CompositionAsset={id:"image",mediaId:"image",name:"Imagem.png",kind:"image",durationUs:0,width:400,height:300,transcript:[]};
const onAsset=vi.fn(),onPath=vi.fn(),onPause=vi.fn(),onError=vi.fn();
const controller:CompositionTimelineDropController={contains:point=>point.x>=400&&point.x<1000&&point.y>=100&&point.y<400,
  resolve:point=>point.x>=400&&point.x<1000&&point.y>=100&&point.y<400?{frame:Math.round(point.x-400),trackId:"V2"}:null,
  hover:vi.fn(()=>null),clear:vi.fn()};
beforeEach(()=>{native.listen.mockImplementation(callback=>{listener=callback;return Promise.resolve(native.off);});});
afterEach(async()=>{await view?.close();view=undefined;vi.clearAllMocks();});

function Probe({enabled=true,session="project"}:{enabled?:boolean;session?:string}){
  const scope=useRef<HTMLElement>(null),timeline=useRef(controller);
  const drop=useCompositionMediaDrop({scope,timeline,sessionKey:session,enabled,onAsset,onPath,onPause,onError});
  return <section ref={scope}><section data-composition-library/><button type="button" data-asset onPointerDown={event=>drop.beginAssetDrag(event,asset)}>Imagem</button><output>{String(drop.libraryDropActive)}</output></section>;
}
async function mount(nativeMode=false){
  view=await reactHost(<Probe/>,environment=>{
    if(nativeMode)Object.defineProperty(environment,"__TAURI_INTERNALS__",{value:{},configurable:true});
    Object.defineProperty(environment,"devicePixelRatio",{value:2,configurable:true});
  });
  Object.defineProperty(view.host.querySelector('[data-composition-library]'),"getBoundingClientRect",{value:()=>({left:0,right:300,top:100,bottom:400})});
}
async function emit(payload:Payload){await act(async()=>listener({payload}));}
async function start(){await act(async()=>view!.host.querySelector('[data-asset]')!.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:50,clientY:150,bubbles:true})));}

it("arraste interno insere uma vez no tempo e camada escolhidos e não abre importação",async()=>{
  await mount();await start();
  await act(async()=>{window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:700,clientY:200}));window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:700,clientY:200}));window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:800,clientY:200}));});
  expect(onAsset).toHaveBeenCalledTimes(1);expect(onAsset).toHaveBeenCalledWith(asset,{frame:300,trackId:"V2"});
  expect(onPath).not.toHaveBeenCalled();expect(onPause).toHaveBeenCalledOnce();
  expect(view!.host.querySelector<HTMLElement>('[data-asset]')!.dataset.assetDragged).toBe("true");
});

it("clique sem arraste, Escape e desmontagem não inserem",async()=>{
  await mount();await start();
  await act(async()=>window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:50,clientY:150})));
  await start();
  await act(async()=>{window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:700,clientY:200}));window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",cancelable:true}));window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:700,clientY:200}));});
  expect(onAsset).not.toHaveBeenCalled();
  await start();await view!.close();view=undefined;
  expect(onAsset).not.toHaveBeenCalled();
});

it("drop externo na biblioteca só importa; na timeline captura frame e camada com DPI",async()=>{
  await mount(true);
  await emit({type:"enter",paths:["C:/Imagem.png"],position:{x:200,y:400}});
  expect(view!.host.querySelector("output")!.textContent).toBe("true");
  await emit({type:"drop",paths:["C:/Imagem.png"],position:{x:200,y:400}});
  expect(onPath).toHaveBeenLastCalledWith("C:/Imagem.png",{kind:"library"});
  await emit({type:"drop",paths:["C:/Video.mp4"],position:{x:1400,y:400}});
  expect(onPath).toHaveBeenLastCalledWith("C:/Video.mp4",{kind:"drop",target:{frame:300,trackId:"V2"}});
  expect(onAsset).not.toHaveBeenCalled();
});

it("drop inválido, externo à área, ocupado por modal ou desabilitado não importa",async()=>{
  await mount(true);
  await emit({type:"drop",paths:["a.png","b.png"],position:{x:200,y:400}});
  await emit({type:"drop",paths:["a.exe"],position:{x:200,y:400}});
  await emit({type:"drop",paths:["a.png"],position:{x:3000,y:400}});
  expect(onError).toHaveBeenCalledTimes(2);expect(onPath).not.toHaveBeenCalled();
  const dialog=document.createElement("dialog");dialog.open=true;document.body.append(dialog);
  await emit({type:"drop",paths:["a.png"],position:{x:200,y:400}});dialog.remove();
  await view!.render(<Probe enabled={false}/>);
  await emit({type:"drop",paths:["a.png"],position:{x:200,y:400}});
  expect(onPath).not.toHaveBeenCalled();
});

it("leave cancela hover; trocar projeto ignora evento antigo e limpa listener",async()=>{
  await mount(true);const old=listener;
  await emit({type:"enter",paths:["a.png"],position:{x:200,y:400}});
  await emit({type:"leave"});expect(view!.host.querySelector("output")!.textContent).toBe("false");
  await view!.render(<Probe session="other"/>);
  await act(async()=>old({payload:{type:"drop",paths:["a.png"],position:{x:1400,y:400}}}));
  expect(onPath).not.toHaveBeenCalled();expect(native.off).toHaveBeenCalledOnce();
});

it("desmontar antes da inscrição resolver remove o listener tardio",async()=>{
  let finish!:(off:()=>void)=>void;
  native.listen.mockImplementationOnce(callback=>{listener=callback;return new Promise(resolve=>{finish=resolve;});});
  await mount(true);await view!.close();view=undefined;
  await act(async()=>finish(native.off));
  expect(native.off).toHaveBeenCalledOnce();
  listener({payload:{type:"drop",paths:["a.png"],position:{x:1400,y:400}}});
  expect(onPath).not.toHaveBeenCalled();
});

it("suspende atalhos durante arraste interno e libera comandos depois de soltar",async()=>{
  await mount();await start();const command=vi.fn();window.addEventListener("keydown",command);
  try{
    await act(async()=>window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:700,clientY:200})));
    for(const [key,control] of [["d",true],["s",true],["r",false],[" ",false]] as const){
      const event=new window.KeyboardEvent("keydown",{key,ctrlKey:control,bubbles:true,cancelable:true});
      await act(async()=>view!.host.querySelector('[data-asset]')!.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
    }
    expect(command).not.toHaveBeenCalled();
    await act(async()=>window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:700,clientY:200})));
    await act(async()=>view!.host.querySelector('[data-asset]')!.dispatchEvent(new window.KeyboardEvent("keydown",{key:"d",ctrlKey:true,bubbles:true,cancelable:true})));
    expect(command).toHaveBeenCalledOnce();
  }finally{window.removeEventListener("keydown",command);}
});
