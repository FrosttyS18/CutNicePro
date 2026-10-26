import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorkspace } from "../lib/workspace";
import { useCompositionEditor } from "../hooks/useCompositionEditor";
import { reactHost } from "./react-host";
import type { Composition } from "../lib/composition-types";

vi.mock("../lib/ipc", () => ({
  loadEditorProject: vi.fn(async () => ({ version: 1, project: null, clips: {} })),
  getEditorRecovery: vi.fn(async () => null),
  saveEditorRecovery: vi.fn(async () => undefined),
  discardEditorRecovery: vi.fn(async () => undefined),
  getMedia: vi.fn(async () => null),
  saveEditorDocument: vi.fn(async (_project: string, _clip: string | null, document: Composition, revision: number) => ({
    document: { ...document, revision: revision + 1 }, manuallyEdited: false, editedAtMs: 10,
  })),
}));
const ipc = await import("../lib/ipc");
const target = { projectId: "project", clipId: null };
let editor: ReturnType<typeof useCompositionEditor>;
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.useRealTimers(); vi.clearAllMocks(); });

describe("sessão do editor na interface", () => {
  it("falha da recuperação não impede abrir a versão salva",async()=>{
    vi.mocked(ipc.getEditorRecovery).mockRejectedValueOnce("Recuperação inválida");
    function Probe(){editor=useCompositionEditor(target,emptyWorkspace());return null;}
    mounted=await reactHost(<Probe/>);
    expect(editor.document).not.toBeNull();
    expect(editor.loading).toBe(false);
    expect(editor.error).toContain("Recuperação inválida");
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
    const document=editor.document;
    await act(async()=>{editor.dismissError();});
    expect(editor.error).toBeNull();expect(editor.document).toBe(document);
  });
  it("o timer grava só recuperação; Salvar confirma a montagem", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    function Probe() { editor = useCompositionEditor(target, emptyWorkspace()); return null; }
    mounted = await reactHost(<Probe />);
    expect(editor.loading).toBe(false);
    await act(async () => { editor.apply({ ...editor.document!, settings: { ...editor.document!.settings, text: "Rascunho" } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
    expect(ipc.saveEditorRecovery).toHaveBeenCalledOnce();
    expect(editor.dirty).toBe(true);
    await act(async () => { expect(await editor.save()).toBe(true); });
    expect(ipc.saveEditorDocument).toHaveBeenCalledOnce();
    expect(editor.dirty).toBe(false);
  });

  it("dados novos de transcrição não substituem o rascunho em edição", async () => {
    const original = emptyWorkspace();
    function Probe({ incoming = original }) { editor = useCompositionEditor(target, incoming); return null; }
    mounted = await reactHost(<Probe />);
    await act(async () => { editor.apply({ ...editor.document!, settings: { ...editor.document!.settings, text: "Edição" } }); });
    await mounted.render(<Probe incoming={{ ...original, transcript: [{ id: "asr", start: 0, end: 1, text: "Transcrição nova" }] }} />);
    expect(editor.document!.settings.text).toBe("Edição");
    expect(editor.dirty).toBe(true);
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });
  it("oferece ASR tardia como edição explícita, reversível e sem confirmar a montagem",async()=>{
    const original=emptyWorkspace();original.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
    function Probe({incoming=original}){editor=useCompositionEditor(target,incoming);return null;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{editor.apply({...editor.document!,settings:{...editor.document!.settings,text:"Meu rascunho"}});});
    const transcript=[{id:"new",start:1,end:2,text:"Transcrição tardia"}];
    await mounted.render(<Probe incoming={{...original,transcriptMode:"real",transcript}}/>);
    expect(editor.canApplyCaptions).toBe(true);expect(editor.document?.assets[0].transcript).toEqual([]);
    expect(editor.document?.items.some(item=>item.kind==="caption")).toBe(false);
    await act(async()=>{expect(editor.applyCaptions()).toBe(true);});
    expect(editor.document?.items.some(item=>item.kind==="caption")).toBe(true);expect(editor.document?.settings.text).toBe("Meu rascunho");
    expect(editor.canApplyCaptions).toBe(false);expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
    expect(editor.savedDocument?.assets[0].transcript).toEqual([]);expect(transcript[0].text).toBe("Transcrição tardia");
    await act(async()=>{editor.undo();});
    expect(editor.document?.items.some(item=>item.kind==="caption")).toBe(false);expect(editor.document?.settings.text).toBe("Meu rascunho");expect(editor.canApplyCaptions).toBe(true);
  });
});
