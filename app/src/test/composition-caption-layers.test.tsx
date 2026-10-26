import { afterEach, expect, it, vi } from "vitest";
import { CompositionStage } from "../components/editor/CompositionStage";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { duplicateSelection } from "../lib/composition-insert";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("../lib/frame-seeker", () => ({ FrameSeeker: class { getFrameAt() { return Promise.resolve(null); } dispose() {} } }));
vi.mock("../lib/composition-audio", () => ({ CompositionAudio: class { volume() {} resume() { return Promise.resolve(); } detach() {} dispose() {} } }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "Fonte", duration: 10, width: 640, height: 360, videoId: null, url: null };
  workspace.settings.captionModel = 1;
  workspace.transcript = [{ id: "s", start: 0, end: 5, text: "Legenda original" }];
  const original = compositionFromLegacy(workspace);
  const document = duplicateSelection(original, [original.items[0].id]);
  document.items.filter(item => item.kind === "caption")[1].captionEdits.s = "Legenda da cópia";
  return document;
}

it("compõe cada legenda vinculada dentro de sua camada, inclusive faixa bloqueada", async () => {
  const document = fixture();
  document.tracks.filter(track => track.kind === "caption").forEach(track => { track.locked = true; });
  const before = structuredClone(document);
  mounted = await reactHost(<CompositionStage document={document} frame={30} playing={false} media={{ source: { url: "source.mp4", error: null } }} onError={vi.fn()}/>);
  const layers = mounted.host.querySelectorAll("[data-composition-layer]");
  expect(layers).toHaveLength(2);
  expect(layers[0].textContent).toContain("Legenda original");
  expect(layers[1].textContent).toContain("Legenda da cópia");
  expect(mounted.host.querySelectorAll(".composition-stage > .caption-overlay")).toHaveLength(0);
  expect(document).toEqual(before);
});

it("não deixa legenda de vídeo oculto vazar e preserva legenda independente acima da montagem", async () => {
  const document = fixture();
  const video = document.items.find(item => item.kind === "video")!;
  document.tracks.find(track => track.id === video.trackId)!.hidden = true;
  const independent = structuredClone(document.items.find(item => item.kind === "caption")!);
  independent.id = "independent";
  independent.followsMain = false;
  independent.captionEdits.s = "Título independente";
  document.items.push(independent);
  mounted = await reactHost(<CompositionStage document={document} frame={30} playing={false} media={{ source: { url: "source.mp4", error: null } }} onError={vi.fn()}/>);
  expect(mounted.host.textContent).not.toContain("Legenda original");
  expect(mounted.host.querySelectorAll(".composition-stage > .caption-overlay")).toHaveLength(1);
  expect(mounted.host.textContent).toContain("Título independente");
  expect(mounted.host.querySelector("[data-composition-layer]")?.textContent).toContain("Legenda da cópia");
});
