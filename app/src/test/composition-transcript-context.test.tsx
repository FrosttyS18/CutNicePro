import { act } from "react";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { CompositionEditorBody } from "../components/editor/CompositionEditorBody";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { duplicateSelection } from "../lib/composition-insert";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
import { reactHost } from "./react-host";

const bootstrap = await vi.hoisted(async () => {
  const { Window } = await import("happy-dom");
  const environment = new Window({ url: "http://localhost" });
  vi.stubGlobal("window", environment);
  vi.stubGlobal("document", environment.document);
  return environment;
});

vi.mock("../hooks/useCompositionMedia", () => ({ useCompositionMedia: () => ({}) }));
vi.mock("../hooks/useTimelinePreview", () => ({ useTimelinePreview: () => ({ frames: [], peaks: [], error: null }) }));
vi.mock("../components/editor/CompositionStage", () => ({ CompositionStage: () => null }));
vi.mock("../components/editor/CompositionSource", () => ({ CompositionSource: () => null }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });
afterAll(async () => { await bootstrap.happyDOM.cancelAsync(); });

it("transcrição acompanha a cópia selecionada e busca seu tempo de saída sem alterar outra ocorrência", async () => {
  const legacy = emptyWorkspace();
  legacy.media = { kind: "local", mediaId: "source", name: "Fonte", duration: 20, width: 640, height: 360, videoId: null, url: null };
  legacy.transcript = [{ id: "s", start: 2, end: 5, text: "Original", words: [{ text: "Original", start: 2, end: 5 }] }];
  const original = compositionFromLegacy(legacy);
  const document = duplicateSelection(original, [original.items[0].id]);
  const videos = document.items.filter(item => item.kind === "video");
  const captions = document.items.filter(item => item.kind === "caption");
  document.items.filter(item => item.groupId === videos[1].groupId).forEach(item => { item.startFrame = 300; });
  captions[1].captionEdits.s = { text: "Segunda ocorrência", words: [{ text: "Segunda", start: 2, end: 3 }, { text: "ocorrência", start: 3, end: 5 }] };
  const seek = vi.fn();
  const props = { projectId: "project", document, legacy, frame: 360, playing: false, sourceUrl: null, onChange: vi.fn<(next: Composition) => void>(), onSeek: seek, onPause: vi.fn(), onError: vi.fn(), onPreviews: vi.fn(), onPreview: vi.fn() };
  mounted = await reactHost(<CompositionEditorBody {...props} selected={[videos[1].id]}/>, environment => { vi.stubGlobal("ResizeObserver", environment.ResizeObserver); });
  await mounted.click("Transcrição");
  const panel = mounted.host.querySelector('[aria-label="Texto da transcrição"]')!;
  expect(panel.textContent).toContain("Segunda");
  expect(panel.textContent).not.toContain("Original");
  const word = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Segunda");
  expect(word).toBeDefined();
  await act(async () => { word!.click(); });
  expect(seek).toHaveBeenLastCalledWith(360);
  const edit = panel.querySelector<HTMLButtonElement>(".transcript-edit-action")!;
  await act(async () => { edit.click(); });
  const textarea = panel.querySelector<HTMLTextAreaElement>("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), "value")!.set!.call(textarea, "Correção só da segunda");
    textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  expect(props.onChange).toHaveBeenCalledOnce();
  const edited = props.onChange.mock.calls[0][0];
  expect(edited.items.find(item => item.id === captions[1].id)!.captionEdits.s).toMatchObject({ text: "Correção só da segunda" });
  expect(edited.items.find(item => item.id === captions[0].id)!.captionEdits).toEqual(captions[0].captionEdits);
  await mounted.render(<CompositionEditorBody {...props} selected={[videos[0].id]}/>);
  expect(panel.textContent).toContain("Original");
  expect(panel.textContent).not.toContain("Segunda");
  const originalWord = Array.from(panel.querySelectorAll<HTMLButtonElement>("button.transcript-word")).find(button => button.textContent === "Original");
  expect(originalWord).toBeDefined();
  await act(async () => { originalWord!.click(); });
  expect(seek).toHaveBeenLastCalledWith(60);
  expect(props.onChange).toHaveBeenCalledOnce();
  expect(document.assets[0].transcript[0].text).toBe("Original");
});
