import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useCompositionCommands } from "../hooks/useCompositionCommands";
import { CompositionSession } from "../lib/composition-session";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });
function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "Fonte", duration: 10, width: 640, height: 360, videoId: null, url: null };
  return compositionFromLegacy(workspace);
}

it.each(["split", "trimLeft", "trimRight"] as const)("R→%s limpa o intervalo com uma única edição reversível", async command => {
  const original = fixture(), session = new CompositionSession(original, { save: vi.fn() }), change = vi.fn();
  let commands!: ReturnType<typeof useCompositionCommands>;
  function Probe() {
    const [document, setDocument] = useState(session.document);
    const [range, setRange] = useState<{ start: number; end: number } | null>({ start: 30, end: 120 });
    commands = useCompositionCommands({ document, selected: command === "split" ? [] : [document.items[0].id], frame: 90, range,
      onChange: next => { change(next); session.apply(next); setDocument(session.document); }, onSelect: vi.fn(), onRange: setRange, onSeek: vi.fn(),
      onError: vi.fn(), onSave: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), onTogglePlay: vi.fn() });
    return <output data-range={range ? "selected" : "none"}/>;
  }
  mounted = await reactHost(<Probe/>);
  await act(async () => commands[command]());
  expect(change).toHaveBeenCalledTimes(1);
  expect(mounted.host.querySelector("output")!.getAttribute("data-range")).toBe("none");
  const video = session.document.items.filter(item => item.kind === "video");
  expect(video.map(item => [item.startFrame, item.durationFrames])).toEqual(command === "split" ? [[0, 90], [90, 210]] : command === "trimLeft" ? [[90, 210]] : [[0, 90]]);
  expect(session.canUndo).toBe(true);
  session.undo(); expect(session.document).toEqual(original); expect(session.canUndo).toBe(false);
});

it("copiar mantém o intervalo e Q/W sem seleção não alteram dados nem apagam R", async () => {
  const document = fixture(), change = vi.fn(), range = vi.fn();
  let commands!: ReturnType<typeof useCompositionCommands>;
  function Probe() {
    commands = useCompositionCommands({ document, selected: [], frame: 90, range: { start: 30, end: 120 }, onChange: change, onSelect: vi.fn(), onRange: range,
      onSeek: vi.fn(), onError: vi.fn(), onSave: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), onTogglePlay: vi.fn() });
    return null;
  }
  mounted = await reactHost(<Probe/>);
  await act(async () => { expect(commands.copy()).toBe(true); commands.trimLeft(); commands.trimRight(); });
  expect(change).not.toHaveBeenCalled(); expect(range).not.toHaveBeenCalled();
});

it("split na borda não publica edição vazia nem limpa seleção de intervalo", async () => {
  const document = fixture(), change = vi.fn(), range = vi.fn();
  let commands!: ReturnType<typeof useCompositionCommands>;
  function Probe() {
    commands = useCompositionCommands({ document, selected: [document.items[0].id], frame: 0, range: { start: 0, end: 120 }, onChange: change, onSelect: vi.fn(), onRange: range,
      onSeek: vi.fn(), onError: vi.fn(), onSave: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), onTogglePlay: vi.fn() });
    return null;
  }
  mounted = await reactHost(<Probe/>);
  await act(async () => commands.split());
  expect(change).not.toHaveBeenCalled(); expect(range).not.toHaveBeenCalled();
});
