import { act, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionSource } from "../components/editor/CompositionSource";
import { reactHost } from "./react-host";
import type { CompositionAsset } from "../lib/composition-types";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });
const asset: CompositionAsset = { id: "source", mediaId: "source", name: "source.mp4", kind: "video", durationUs: 10_000_000, width: 1920, height: 1080, transcript: [] };
describe("fonte no runtime de desenvolvimento", () => {
  it("pausar uma reprodução pendente não bloqueia a inserção com AbortError",async()=>{
    const insert=vi.fn();
    mounted=await reactHost(<CompositionSource asset={asset} url="source.mp4" onInsert={insert} onActivate={vi.fn()}/>);
    const video=mounted.host.querySelector("video")!;
    const interrupted=new Error("Reprodução interrompida");interrupted.name="AbortError";
    vi.spyOn(video,"play").mockRejectedValueOnce(interrupted);
    await act(async()=>mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Reproduzir fonte"]')!.click());
    expect(mounted.host.querySelector('[role="alert"]')).toBeNull();
    const button=mounted.host.querySelector<HTMLButtonElement>('[aria-label="Adicionar em nova camada"]')!;
    expect(button.getAttribute("aria-disabled")).toBe("false");
    await act(async()=>button.click());expect(insert).toHaveBeenCalledTimes(1);
  });
  it("não transforma Espaço no botão Adicionar em reprodução da fonte",async()=>{
    mounted=await reactHost(<CompositionSource asset={asset} url="source.mp4" onInsert={vi.fn()} onActivate={vi.fn()}/>);
    const video=mounted.host.querySelector("video")!;const play=vi.spyOn(video,"play").mockResolvedValue();
    const button=mounted.host.querySelector<HTMLButtonElement>('[aria-label="Adicionar em nova camada"]')!;
    const event=new window.KeyboardEvent("keydown",{key:" ",bubbles:true,cancelable:true});
    await act(async()=>{button.focus();button.dispatchEvent(event);});
    expect(play).not.toHaveBeenCalled();expect(event.defaultPrevented).toBe(false);
  });
  it("mantém a URL após o replay de efeitos do StrictMode e limpa no unmount", async () => {
    mounted = await reactHost(<StrictMode><CompositionSource asset={asset} url="http://cnplocal.localhost/source.mp4" onInsert={vi.fn()} onActivate={vi.fn()}/></StrictMode>);
    const video = mounted.host.querySelector<HTMLVideoElement>("video")!;
    expect(video.getAttribute("src")).toBe("http://cnplocal.localhost/source.mp4");
    await mounted.close(); mounted = undefined;
    expect(video.hasAttribute("src")).toBe(false);
  });
  it("Enter no painel insere uma vez e ignora repetição, composição e modificadores", async () => {
    const insert=vi.fn();
    mounted=await reactHost(<CompositionSource asset={asset} url="source.mp4" onInsert={insert} onActivate={vi.fn()}/>);
    const panel=mounted.host.querySelector<HTMLElement>(".composition-source")!;
    for(const options of [{repeat:true},{isComposing:true},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true}]){
      await act(async()=>panel.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true,...options})));
    }
    expect(insert).not.toHaveBeenCalled();
    await act(async()=>panel.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(0,10);
    const button=mounted.host.querySelector<HTMLButtonElement>('[aria-label="Adicionar em nova camada"],[aria-label="Adicionar no cursor"]')!;
    await act(async()=>button.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it.each(["unavailable","error"])("Enter não insere uma fonte em estado %s",async state=>{
    const insert=vi.fn();
    mounted=await reactHost(<CompositionSource asset={asset} url={state==="unavailable"?null:"source.mp4"} onInsert={insert} onActivate={vi.fn()}/>);
    if(state==="error")await act(async()=>mounted!.host.querySelector('video')!.dispatchEvent(new window.Event("error")));
    await act(async()=>mounted!.host.querySelector<HTMLElement>('.composition-source')!.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));
    expect(insert).not.toHaveBeenCalled();
    const button=mounted.host.querySelector<HTMLButtonElement>('[aria-label="Adicionar em nova camada"],[aria-label="Adicionar no cursor"]')!;
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });
});
