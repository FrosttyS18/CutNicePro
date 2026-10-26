import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionMediaLibrary } from "../components/editor/CompositionMediaLibrary";
import type { CompositionAsset } from "../lib/composition-types";
import { reactHost } from "./react-host";

vi.mock("../components/editor/CompositionMediaPoster",()=>({CompositionMediaPoster:()=>null}));
vi.mock("../components/workspace/RelinkMediaControl",()=>({RelinkMediaControl:()=>null}));
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});
const asset:CompositionAsset={id:"image",mediaId:"image",name:"Imagem.png",kind:"image",durationUs:0,width:400,height:300,transcript:[]};

it("Importar mídia abre seleção única sem menu de faixa ou inserir",async()=>{
  const onImport=vi.fn(),onInsert=vi.fn();
  view=await reactHost(<CompositionMediaLibrary assets={[asset]} selectedId="image" previews={{}} media={{image:{url:"image.png",error:null}}}
    onSelect={vi.fn()} onOpen={vi.fn()} onInsert={onInsert} onImport={onImport}/>);
  await view.click("Importar mídia");
  expect(onImport).toHaveBeenCalledOnce();expect(onInsert).not.toHaveBeenCalled();
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("inicia arraste por ponteiro da mídia disponível, sem HTML5 draggable",async()=>{
  const onAssetDrag=vi.fn();
  view=await reactHost(<CompositionMediaLibrary assets={[asset]} selectedId="image" previews={{}} media={{image:{url:"image.png",error:null}}}
    onSelect={vi.fn()} onOpen={vi.fn()} onInsert={vi.fn()} onImport={vi.fn()} onAssetDrag={onAssetDrag}/>);
  const button=view.host.querySelector<HTMLButtonElement>('[aria-label="Selecionar mídia: Imagem.png"]')!;
  await act(async()=>button.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,bubbles:true})));
  expect(onAssetDrag).toHaveBeenCalledWith(expect.anything(),asset);
  expect(button.getAttribute("draggable")).toBe("false");
});

it("mídia indisponível continua selecionável sem iniciar arraste",async()=>{
  const onSelect=vi.fn(),onAssetDrag=vi.fn();
  view=await reactHost(<CompositionMediaLibrary assets={[asset]} selectedId="image" previews={{}} media={{image:{url:null,error:"Ausente"}}}
    onSelect={onSelect} onOpen={vi.fn()} onInsert={vi.fn()} onImport={vi.fn()} onAssetDrag={onAssetDrag}/>);
  const button=view.host.querySelector<HTMLButtonElement>('[aria-label="Selecionar mídia: Imagem.png"]')!;
  await act(async()=>{button.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,bubbles:true}));button.click();});
  expect(onSelect).toHaveBeenCalledWith(asset);expect(onAssetDrag).not.toHaveBeenCalled();
});
