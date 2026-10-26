import { act, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionCommands } from "../hooks/useCompositionCommands";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { CompositionSession } from "../lib/composition-session";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });
function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "source.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  const document = compositionFromLegacy(workspace);
  document.tracks.push({ ...document.tracks[0], id: "V2", name: "Camada 2", primary: false });
  document.items.push({ ...structuredClone(document.items[0]), id: "overlay", groupId: "overlay", trackId: "V2", followsMain: false });
  return document;
}

describe("atalhos para aparar no cursor", () => {
  it("Q/W publicam uma única edição com um único undo e preservam a camada não selecionada", async () => {
    const original = fixture();
    const session = new CompositionSession(original, { save: vi.fn() });
    const changed = vi.fn();
    let commands: ReturnType<typeof useCompositionCommands>;
    function Probe() {
      const [document, setDocument] = useState(session.document);
      commands = useCompositionCommands({ document, selected: [document.items[0].id], frame: 90, range: { start: 0, end: 300 },
        onChange: next => { changed(next); session.apply(next); setDocument(session.document); }, onSelect: vi.fn(), onRange: vi.fn(), onSeek: vi.fn(),
        onError: vi.fn(), onSave: vi.fn(), onUndo: () => { session.undo(); setDocument(session.document); }, onRedo: vi.fn(), onTogglePlay: vi.fn() });
      return <div data-editor-timeline tabIndex={0}/>;
    }
    mounted = await reactHost(<Probe/>);
    expect(commands!.canTrimLeft).toBe(true); expect(commands!.canTrimRight).toBe(true);
    for (const key of ["q", "w"]) {
      await act(async () => { window.dispatchEvent(new window.KeyboardEvent("keydown", { key, cancelable: true })); });
      expect(session.document.items[0]).toMatchObject(key === "q" ? { startFrame: 90, durationFrames: 210 } : { startFrame: 0, durationFrames: 90 });
      expect(session.document.items.find(item => item.id === "overlay")).toEqual(original.items.find(item => item.id === "overlay"));
      expect(changed).toHaveBeenCalledTimes(key === "q" ? 1 : 2);
      await act(async () => { window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true })); });
      expect(session.document).toEqual(original); expect(session.canUndo).toBe(false);
    }
  });

  it("ignora modificadores, campos, fonte, fora do editor e modo desabilitado", async () => {
    const document = fixture(); const change = vi.fn();
    function Probe({ enabled = true }: { enabled?: boolean }) {
      const scope = useRef<HTMLElement | null>(null);
      useCompositionCommands({ document, selected: [document.items[0].id], frame: 90, range: null, enabled, scope, onChange: change,
        onSelect: vi.fn(), onRange: vi.fn(), onSeek: vi.fn(), onError: vi.fn(), onSave: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), onTogglePlay: vi.fn() });
      return <><section ref={scope}><input/><div data-editor-viewer="source" tabIndex={0}/><div data-editor-timeline tabIndex={0}/></section><button type="button">Fora</button></>;
    }
    mounted = await reactHost(<Probe/>);
    const timeline = mounted.host.querySelector<HTMLElement>("[data-editor-timeline]")!;
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
      await act(async () => { timeline.focus(); timeline.dispatchEvent(new window.KeyboardEvent("keydown", { key: "q", ...modifiers, bubbles: true })); });
    }
    for (const selector of ["input", '[data-editor-viewer="source"]', "button"]) {
      const target = mounted.host.querySelector<HTMLElement>(selector)!;
      await act(async () => { target.focus(); target.dispatchEvent(new window.KeyboardEvent("keydown", { key: "w", bubbles: true })); });
    }
    await mounted.render(<Probe enabled={false}/>);
    await act(async () => { timeline.focus(); timeline.dispatchEvent(new window.KeyboardEvent("keydown", { key: "q", bubbles: true })); });
    expect(change).not.toHaveBeenCalled();
  });

  it("expõe funções sem alterar histórico nas bordas e não infere seleção pelo cursor", async () => {
    const document = fixture(); const change = vi.fn(); const error = vi.fn();
    let commands: ReturnType<typeof useCompositionCommands>;
    function Probe({ frame, selected }: { frame: number; selected: string[] }) {
      commands = useCompositionCommands({ document, selected, frame, range: null, onChange: change, onSelect: vi.fn(), onRange: vi.fn(), onSeek: vi.fn(),
        onError: error, onSave: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), onTogglePlay: vi.fn() }); return null;
    }
    for (const [frame, selected] of [[0, [document.items[0].id]], [300, [document.items[0].id]], [90, []]] as [number, string[]][]) {
      if (!mounted) mounted = await reactHost(<Probe frame={frame} selected={selected}/>);
      else await mounted.render(<Probe frame={frame} selected={selected}/>);
      expect(commands!.canTrimLeft).toBe(false); expect(commands!.canTrimRight).toBe(false);
      await act(async () => { commands.trimLeft(); commands.trimRight(); });
    }
    expect(change).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
});
