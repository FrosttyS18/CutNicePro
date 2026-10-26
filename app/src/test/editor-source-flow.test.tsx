import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { VideoEditor } from "../components/editor/VideoEditor";
import { defaultEditorSettings, emptyWorkspace } from "../lib/workspace";
import { captureClipEdits, openClipWorkspace } from "../lib/clip-workspace";
import { isolatedClipSettings, renderSettings, type Clip } from "../lib/clips";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { effectiveSegments } from "../lib/edit-plan";
import { defaultSplitScreen } from "../lib/split-screen";
import * as ipc from "../lib/ipc";
import type { EditSegment } from "../lib/workspace-types";
import { reactHost } from "./react-host";

vi.mock("../hooks/useVideoFrames", () => ({ useVideoFrames: () => [] }));
vi.mock("../hooks/useTimelinePreview", () => ({ useTimelinePreview: () => ({ frames: [], peaks: [], loading: false, hasAudio: false, error: null }) }));

const clip: Clip = { id: "b".repeat(64), start: 10, end: 60, title: "História", score: 80, reasons: [], review: "pending" };
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function mount(asClip = true, legacySplit = false, verified = false, windows?: EditSegment[]) {
  let current = emptyWorkspace();
  current.media = { kind: "local", mediaId: "m", name: "Fonte.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 180 };
  if (asClip) current = openClipWorkspace(current, clip);
  if (windows) current.settings = { ...current.settings, trimStart: windows[0].sourceStart, trimEnd: windows[windows.length - 1].sourceEnd,
    editPlan: { version: 1, segments: windows } };
  if (legacySplit) current.settings = { ...current.settings, ratio: "9:16", splitScreen: { ...defaultSplitScreen(), faceValidated: verified } };
  function Flow() {
    const [data, setData] = useState(current);
    return <VideoEditor projectId="p" title="Fonte" data={data} activeClip={asClip ? clip : undefined} localUrl="blob:source" dirty={false}
      onChange={next => { current = captureClipEdits(next); setData(current); }} onSave={() => saveWorkspace("source-flow", current)} onBack={() => {}}/>;
  }
  view = await reactHost(<Flow/>, environment => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    for (const [key, value] of Object.entries({ readyState: 2, duration: 180, paused: true, seeking: false })) {
      Object.defineProperty(environment.HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
    }
  });
  return { ...view, current: () => current };
}

async function key(label: string, value: string, ctrlKey = false) {
  const target = view!.host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
  await act(async () => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, ctrlKey, bubbles: true, cancelable: true })));
}

it("permite buscar a fala posterior ao corte da IA antes de ampliá-lo", async () => {
  const ui = await mount();
  await key("Posição do vídeo", "End");
  expect(ui.host.querySelector("video")!.currentTime).toBe(180);
});

it("amplia, desfaz, refaz, salva, reabre e prepara o mesmo intervalo para download", async () => {
  const ui = await mount();
  await key("Fim do trecho 1", "End");
  expect(effectiveSegments(ui.current().settings, 180)).toEqual([{ sourceStart: 10, sourceEnd: 180 }]);
  await key("Fim do trecho 1", "z", true);
  expect(effectiveSegments(ui.current().settings, 180)).toEqual([{ sourceStart: 10, sourceEnd: 60 }]);
  await key("Fim do trecho 1", "y", true);
  expect(saveWorkspace("source-flow", ui.current())).toBe(true);
  const saved = readWorkspace("source-flow");
  const reopened = openClipWorkspace(saved, clip);
  const download = isolatedClipSettings(clip, saved.clipEdits![clip.id], saved.media);
  expect(effectiveSegments(reopened.settings, 180)).toEqual([{ sourceStart: 10, sourceEnd: 180 }]);
  expect(renderSettings(download)).toMatchObject({ trimStart: 10, trimEnd: 180 });
});

it("oferece divisão no vídeo completo sem modo técnico exclusivo de clipes", async () => {
  const ui = await mount(false);
  await key("Posição do vídeo", "ArrowRight");
  const split = ui.host.querySelector<HTMLButtonElement>('button[aria-label="Dividir no cursor"]');
  expect(split).not.toBeNull();
  expect(split!.disabled).toBe(false);
  await act(async () => split!.click());
  expect(ui.current().settings.editPlan?.segments).toHaveLength(2);
  expect(ui.host.textContent).not.toContain("Corte simples");
  expect(ui.host.querySelector(".framing-toolbar")?.textContent).not.toContain("Cortar tempo");
  expect(defaultEditorSettings().editPlan).toBeUndefined();
});

it("o modo enquadrar move a imagem pela área da prévia sem disparar reprodução", async () => {
  const ui = await mount();
  await ui.click("Enquadrar");
  const preview = ui.host.querySelector<HTMLElement>(".workspace-preview")!;
  Object.defineProperty(preview, "getBoundingClientRect", { value: () => ({ left: 100, top: 100, width: 200, height: 400 }) });
  expect(preview.querySelector(".video-surface-toggle")).toBeNull();
  const event = (type: string, x: number) => {
    const pointer = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(pointer, { button: { value: 0 }, clientX: { value: x }, clientY: { value: 150 } });
    return pointer;
  };
  await act(async () => preview.dispatchEvent(event("pointerdown", 150)));
  await act(async () => window.dispatchEvent(event("pointermove", 170)));
  await act(async () => window.dispatchEvent(event("pointerup", 170)));
  expect(ui.current().settings.focalPoint?.x).toBe(40);
});

it("reabre um split antigo, confirma a fonte e remove a duplicação quando há só uma pessoa", async () => {
  const suggest = vi.spyOn(ipc, "suggestSplitScreen").mockResolvedValue({ status: "manual", message: "Há apenas uma pessoa neste quadro." });
  const ui = await mount(true, true);
  expect(suggest).toHaveBeenCalledWith({ projectId: "p", mediaId: "m", start: 10, end: 60 });
  expect(ui.current().settings.splitScreen).toBeNull();
  expect(ui.host.querySelector(".split-preview")).toBeNull();
  expect(ui.host.textContent).toContain("Há apenas uma pessoa");
});

it("enquadrar durante a confirmação move a imagem visível e preserva painéis ocultos", async () => {
  vi.spyOn(ipc, "suggestSplitScreen").mockImplementation(() => new Promise(() => {}));
  const ui = await mount(true, true);
  await ui.click("Enquadrar");
  const preview = ui.host.querySelector<HTMLElement>(".workspace-preview")!;
  Object.defineProperty(preview, "getBoundingClientRect", { value: () => ({ left: 100, top: 100, width: 200, height: 400 }) });
  const event = (type: string, x: number) => {
    const pointer = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(pointer, { button: { value: 0 }, clientX: { value: x }, clientY: { value: 150 } });
    return pointer;
  };
  await act(async () => preview.dispatchEvent(event("pointerdown", 150)));
  await act(async () => window.dispatchEvent(event("pointermove", 170)));
  await act(async () => window.dispatchEvent(event("pointerup", 170)));
  expect(ui.current().settings.focalPoint?.x).toBe(40);
  expect(ui.current().settings.splitScreen?.top.x).toBe(0);
});

it("ampliar o intervalo revalida as pessoas na parte nova do vídeo", async () => {
  const suggest = vi.spyOn(ipc, "suggestSplitScreen").mockResolvedValue({ status: "manual", message: "O plano mudou para uma pessoa." });
  const ui = await mount(true, true, true);
  expect(suggest).not.toHaveBeenCalled();
  await key("Fim do trecho 1", "End");
  expect(suggest).toHaveBeenCalledWith({ projectId: "p", mediaId: "m", start: 10, end: 180 });
  expect(ui.current().settings.splitScreen).toBeNull();
  expect(ui.current().settings.trimEnd).toBe(180);
  await key("Fim do trecho 1", "z", true);
  expect(ui.current().settings.trimEnd).toBe(60);
  expect(ui.current().settings.splitScreen?.faceValidated).toBe(true);
});

it.each(["buscar", "reproduzir"])("não toca o vão removido ao %s com o vídeo ativo", async mode => {
  const ui = await mount(true, false, false, [{ sourceStart: 10, sourceEnd: 20 }, { sourceStart: 40, sourceEnd: 60 }]);
  const video = ui.host.querySelector("video")!;
  video.currentTime = 30;
  await act(async () => video.dispatchEvent(new window.Event("timeupdate")));
  Object.defineProperty(video, "paused", { configurable: true, get: () => false });
  if (mode === "buscar") await key("Posição do vídeo", "ArrowRight");
  else await act(async () => video.dispatchEvent(new window.Event("timeupdate")));
  expect(video.currentTime).toBe(40);
});
