import { afterEach, expect, it, vi } from "vitest";
import { CompositionEditorBody } from "../components/editor/CompositionEditorBody";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

const media=vi.hoisted(()=>({url:"cnplocal://media/image.png" as string|null}));
const invoke=vi.hoisted(()=>vi.fn());
vi.mock("@tauri-apps/api/core",()=>({invoke}));
vi.mock("../hooks/useCompositionMedia",()=>({useCompositionMedia:()=>({source:{url:media.url,error:null}})}));
vi.mock("../components/editor/CompositionStage",()=>({CompositionStage:()=> <div/>}));
vi.mock("../components/editor/CompositionMediaPoster",()=>({CompositionMediaPoster:()=>null}));
vi.mock("../components/workspace/RelinkMediaControl",()=>({RelinkMediaControl:()=>null}));

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;vi.clearAllMocks();media.url="cnplocal://media/image.png";});

function fixture(kind:"image"|"video"="image"){
  const legacy=emptyWorkspace();
  legacy.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:5,width:160,height:90,videoId:null,url:null};
  const document=compositionFromLegacy(legacy,{hasAudio:false});
  document.assets[0]={...document.assets[0],kind,name:kind==="image"?"Imagem.png":"Fonte.mp4",durationUs:kind==="image"?0:5_000_000};
  document.items[0]={...document.items[0],kind};
  const onPreviews=vi.fn();
  const props={projectId:"project",document,frame:0,playing:false,selected:[],sourceUrl:null,legacy,
    onChange:vi.fn(),onSeek:vi.fn(),onPause:vi.fn(),onError:vi.fn(),onPreviews,onPreview:vi.fn()};
  return props;
}

it("envia a imagem resolvida para a timeline sem executar o gerador de vídeo",async()=>{
  const props=fixture();view=await reactHost(<CompositionEditorBody {...props}/>);
  expect(props.onPreviews).toHaveBeenCalledWith("source",{frames:[media.url],peaks:[]});
  const frames=props.onPreviews.mock.lastCall![1].frames;
  await view.render(<CompositionEditorBody {...props} frame={10} document={{...props.document,assets:[{...props.document.assets[0]}]}}/>);
  expect(props.onPreviews).toHaveBeenCalledTimes(1);
  expect(props.onPreviews.mock.lastCall![1].frames).toBe(frames);
  expect(invoke).not.toHaveBeenCalled();
});

it("atualiza a miniatura ao religar a imagem e limpa a URL indisponível",async()=>{
  const props=fixture();view=await reactHost(<CompositionEditorBody {...props}/>);
  media.url="cnplocal://media/image.png?relink=1";
  await view.render(<CompositionEditorBody {...props}/>);
  expect(props.onPreviews).toHaveBeenLastCalledWith("source",{frames:[media.url],peaks:[]});
  media.url=null;
  await view.render(<CompositionEditorBody {...props}/>);
  expect(props.onPreviews).toHaveBeenLastCalledWith("source",{frames:[],peaks:[]});
  expect(invoke).not.toHaveBeenCalled();
});

it("preserva miniaturas e picos de áudio do gerador de vídeo",async()=>{
  invoke.mockResolvedValueOnce({version:2,frames:[[255,216,255,217]],peaks:[0.25,0.75],hasAudio:true});
  const props=fixture("video");view=await reactHost(<CompositionEditorBody {...props}/>);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith("timeline_preview",{mediaId:"source"});
  expect(props.onPreviews).toHaveBeenLastCalledWith("source",{frames:[expect.stringMatching(/^blob:/)],peaks:[0.25,0.75]});
});

it("continua exibindo falha do gerador de prévia sem publicar sucesso",async()=>{
  invoke.mockRejectedValueOnce(new Error("falha controlada"));
  const props=fixture("video");view=await reactHost(<CompositionEditorBody {...props}/>);
  expect(view.host.textContent).toContain("Não foi possível carregar a linha do tempo");
  expect(props.onPreviews.mock.calls.every(([,preview])=>!preview.frames.length&&!preview.peaks.length)).toBe(true);
});

it("vídeo apenas na biblioteca não dispara geração completa da timeline",async()=>{
  const props=fixture();
  props.document.assets.push({...props.document.assets[0],id:"unused",mediaId:"unused",kind:"video",name:"Longo.mp4",durationUs:1_800_000_000});
  view=await reactHost(<CompositionEditorBody {...props}/>);
  expect(invoke).not.toHaveBeenCalled();
  expect(props.onPreviews.mock.calls.map(([id])=>id)).toEqual(["source"]);
});
