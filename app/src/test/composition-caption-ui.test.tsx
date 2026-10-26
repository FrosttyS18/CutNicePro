import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionEditorBody } from "../components/editor/CompositionEditorBody";
import { EditorInspector } from "../components/editor/EditorInspector";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { captionPresets } from "../lib/captions";
import { reactHost } from "./react-host";

vi.mock("../hooks/useCompositionMedia",()=>({useCompositionMedia:()=>({})}));
vi.mock("../hooks/useTimelinePreview",()=>({useTimelinePreview:()=>({frames:[],peaks:[],error:null})}));
vi.mock("../components/editor/CompositionStage",()=>({CompositionStage:()=>null}));
vi.mock("../components/editor/CompositionSource",()=>({CompositionSource:()=>null}));
let mounted:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await mounted?.close();mounted=undefined;});

describe("ações explícitas de legenda",()=>{
  it("mostra processamento e aplica legenda tardia somente após clique",async()=>{
    const apply=vi.fn();const change=vi.fn();const legacy=emptyWorkspace();
    mounted=await reactHost(<CompositionEditorBody projectId="project" document={compositionFromLegacy(legacy)} legacy={legacy} frame={0} playing={false} selected={[]} sourceUrl={null}
      onChange={change} onSeek={vi.fn()} onPause={vi.fn()} onError={vi.fn()} onPreviews={vi.fn()} onPreview={vi.fn()}
      canApplyCaptions onApplyCaptions={apply} transcriptionControls={<button type="button">Transcrever fonte</button>}/>);
    await mounted.click("Transcrição");
    expect(mounted.host.textContent).toContain("Transcrever fonte");expect(apply).not.toHaveBeenCalled();expect(change).not.toHaveBeenCalled();
    await mounted.click("Aplicar legendas à montagem");expect(apply).toHaveBeenCalledOnce();
    expect(mounted.host.textContent).toContain("Outros cortes salvos");
  });
  it("mantém callback público aplicar a todos e separa estilo da montagem",async()=>{
    const all=vi.fn(async()=>undefined);const montage=vi.fn(async()=>undefined);const legacy=emptyWorkspace();
    mounted=await reactHost(<EditorInspector panel="captions" settings={{...legacy.settings,captionModel:3,captionStyle:captionPresets[3].style}}
      onPanel={vi.fn()} onSettings={vi.fn()} onApplyAll={all} onApplyMontage={montage}/>);
    expect(all).not.toHaveBeenCalled();expect(montage).not.toHaveBeenCalled();
    await mounted.click("Aplicar estilo à montagem");expect(montage).toHaveBeenCalledWith(3,expect.objectContaining({font:captionPresets[3].style.font}));expect(all).not.toHaveBeenCalled();
    await mounted.click("Aplicar a todos os cortes");expect(all).toHaveBeenCalledOnce();
    await act(async()=>undefined);
  });
});
