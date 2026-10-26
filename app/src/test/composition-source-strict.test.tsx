import { act, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionSource } from "../components/editor/CompositionSource";
import { reactHost } from "./react-host";
import type { CompositionAsset } from "../lib/composition-types";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });
const asset: CompositionAsset = { id: "source", mediaId: "source", name: "source.mp4", kind: "video", durationUs: 10_000_000, width: 1920, height: 1080, transcript: [] };
describe("fonte no runtime de desenvolvimento", () => {
  it("não transforma Espaço no botão Adicionar em reprodução da fonte",async()=>{
    mounted=await reactHost(<CompositionSource asset={asset} url="source.mp4" onInsert={vi.fn()} onActivate={vi.fn()}/>);
    const video=mounted.host.querySelector("video")!;const play=vi.spyOn(video,"play").mockResolvedValue();
    const button=mounted.host.querySelector<HTMLButtonElement>('[aria-label="Adicionar no cursor"]')!;
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
});
