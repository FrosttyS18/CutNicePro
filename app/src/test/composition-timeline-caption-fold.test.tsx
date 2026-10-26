import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { duplicateSelection } from "../lib/composition-insert";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; });
function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "source.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  workspace.transcriptMode = "real";
  workspace.transcript = [{ id: "s1", start: 0, end: 5, text: "Uma fala com legenda" }];
  return compositionFromLegacy(workspace);
}
it("duplicar conserva legendas no documento e mostra somente tags nos vídeos", async () => {
  const base = fixture(), document = duplicateSelection(base, [base.items[0].id]);
  const originalCaptions = document.items.filter(item => item.kind === "caption");
  view = await reactHost(<CompositionTimeline document={document} frame={0} selected={[]} mode="select" range={null}
    onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()} />);
  expect(originalCaptions).toHaveLength(2);
  expect(view.host.querySelectorAll('[data-kind="caption"][data-composition-item]')).toHaveLength(0);
  expect(view.host.querySelectorAll('[data-kind="video"][data-composition-item] [aria-label="Legendas vinculadas"]')).toHaveLength(2);
  expect(document.items.filter(item => item.kind === "caption")).toEqual(originalCaptions);
});
it("clicar uma camada já incluída numa seleção múltipla isola esse vídeo", async () => {
  const base = fixture(), document = duplicateSelection(base, [base.items[0].id]);
  const videos = document.items.filter(item => item.kind === "video");
  const selected = vi.fn();
  function Harness() {
    const [ids, setIds] = useState(videos.map(item => item.id));
    return <CompositionTimeline document={document} frame={0} selected={ids} mode="select" range={null}
      onSelect={next => { selected(next); setIds(next); }} onRange={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()} />;
  }
  view = await reactHost(<Harness />);
  const item = view.host.querySelector<HTMLElement>(`[data-composition-item="${videos[1].id}"]`)!;
  await act(async () => {
    item.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 300, clientY: 150, bubbles: true }));
    window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 300, clientY: 150 }));
  });
  expect(selected).toHaveBeenLastCalledWith([videos[1].id]);
  expect(view.host.querySelector(`[data-composition-item="${videos[0].id}"]`)?.getAttribute("data-selected")).toBe("false");
});
