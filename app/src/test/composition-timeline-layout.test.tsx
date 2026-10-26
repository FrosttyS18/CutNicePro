import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });
describe("enquadramento inicial da timeline", () => {
  it("apresenta o som original no vídeo e mantém uma faixa própria para áudio adicionado", async () => {
    const workspace = emptyWorkspace();
    workspace.media = { kind: "local", mediaId: "source", name: "source.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
    const document = compositionFromLegacy(workspace);
    mounted = await reactHost(<CompositionTimeline document={document} frame={0} selected={[]} mode="select" range={null} previews={{source:{frames:[],peaks:[.2,.4]}}} onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()}/>);
    expect(mounted.host.querySelector('[aria-label="Faixa Áudio da fonte"]')).toBeNull();
    expect(mounted.host.querySelector('[data-kind="video"][data-composition-item] .composition-item__wave')).not.toBeNull();
    const audio = document.items.find(item => item.kind === "audio")!;
    const independent = { ...document, items: document.items.map(item => item.id === audio.id ? { ...item, groupId: "extracted" } : item) };
    await mounted.render(<CompositionTimeline document={independent} frame={0} selected={[]} mode="select" range={null} onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()}/>);
    expect(mounted.host.querySelector('[aria-label="Faixa Áudio da fonte"]')).not.toBeNull();
  });
  it("ajusta a primeira montagem à largura real, sem criar uma régua muito maior que o vídeo", async () => {
    const workspace = emptyWorkspace();
    workspace.media = { kind: "local", mediaId: "source", name: "source.mp4", duration: 1435.968, width: 1920, height: 1080, videoId: null, url: null };
    const document = compositionFromLegacy(workspace);
    mounted = await reactHost(<CompositionTimeline document={document} frame={0} selected={[]} mode="select" range={null} onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()}/>);
    const viewport = mounted.host.querySelector<HTMLElement>(".composition-timeline__viewport")!;
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 1800 });
    await act(async () => window.dispatchEvent(new window.Event("resize")));
    const item = mounted.host.querySelector<HTMLElement>('[data-kind="video"][data-composition-item]')!;
    expect(parseFloat(item.style.width)).toBeCloseTo(1608, 3);
  });
});
