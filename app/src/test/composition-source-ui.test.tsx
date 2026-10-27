import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionSource } from "../components/editor/CompositionSource";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async()=>{await mounted?.close();mounted=undefined;});
describe("navegação da fonte",()=>{
  it("usa fps real para avançar, preserva um frame nos pontos I/O e não edita montagem",async()=>{
    const workspace=emptyWorkspace();workspace.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
    const asset=compositionFromLegacy(workspace).assets[0];const insert=vi.fn();
    mounted=await reactHost(<CompositionSource asset={asset} url="https://example.test/source.mp4" fps={{numerator:24,denominator:1}} onInsert={insert} onActivate={vi.fn()}/>);
    const section=mounted.host.querySelector<HTMLElement>('section')!;
    await act(async()=>{section.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true,cancelable:true}));});
    expect(mounted.host.querySelector('video')!.currentTime).toBeCloseTo(1/24,7);
    await act(async()=>{section.dispatchEvent(new window.KeyboardEvent("keydown",{key:"i",bubbles:true}));section.dispatchEvent(new window.KeyboardEvent("keydown",{key:"o",bubbles:true}));});
    expect(insert).not.toHaveBeenCalled();
    await act(async()=>{mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Adicionar em nova camada"]')!.click();});
    expect(insert).toHaveBeenCalledWith(0,1/24);
  });
});
