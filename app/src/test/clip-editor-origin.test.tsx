import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import { emptyWorkspace } from "../lib/workspace";
import type { WorkspaceData } from "../lib/workspace-types";
import type { LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";

const state=vi.hoisted(()=>({data:undefined as WorkspaceData|undefined,save:vi.fn(async()=>true),discard:vi.fn(async()=>true)}));
const project={id:"p",name:"Projeto",created_at_ms:1,updated_at_ms:1,last_opened_at_ms:null};
const entry:LibraryClip={project,mediaId:"source",clip:{id:"clip",start:1,end:5,title:"Trecho",score:80,reasons:[],review:"pending"}};
vi.mock("@tauri-apps/api/core",()=>({isTauri:()=>false}));
vi.mock("../lib/ipc",()=>({listProjects:vi.fn(async()=>[project]),listCollections:vi.fn(async()=>[]),openProject:vi.fn(async()=>project)}));
vi.mock("../services/clip-media",()=>({prepareClipEditing:vi.fn(async()=>{})}));
vi.mock("../hooks/useSplashPhase",()=>({useSplashPhase:()=>({visible:false})}));
vi.mock("../components/WindowTitlebar",()=>({WindowTitlebar:()=>null}));
vi.mock("../components/shell/AppShell",()=>({AppShell:({children,onNavigateProjects}:{children:ReactNode;onNavigateProjects:(view:string)=>void})=><main><button onClick={()=>onNavigateProjects("all")}>Biblioteca global</button><div className="panel-body">{children}</div></main>}));
vi.mock("../screens/HomeScreen",()=>({HomeScreen:()=>null}));
vi.mock("../hooks/useClipLibrary",()=>({useClipLibrary:()=>({entries:[entry],loading:false,error:null,reload:vi.fn()})}));
vi.mock("../hooks/useWorkspaceData",()=>({useWorkspaceData:()=>({data:state.data!,localUrl:"blob:source",dirty:false,notice:null,change:(next:WorkspaceData)=>{state.data=next;},save:async()=>true})}));
vi.mock("../hooks/useTranscription",()=>({useTranscription:()=>({busy:false})}));
vi.mock("../hooks/useClips",()=>({useClips:()=>({collection:{mediaId:"source",clips:[entry.clip]},loading:false,busy:false,reload:vi.fn()})}));
vi.mock("../components/workspace/ProjectThumbnail",()=>({ProjectThumbnail:()=>null}));
vi.mock("../components/workspace/ProjectContextCard",()=>({ProjectContextCard:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock("../components/workspace/PreparationRecoveryNotice",()=>({PreparationRecoveryNotice:()=>null}));
vi.mock("../components/workspace/ProjectOverview",()=>({ProjectOverview:({transcriptionControls}:{transcriptionControls:ReactNode})=><section aria-label="Visão geral do projeto">{transcriptionControls}</section>}));
vi.mock("../components/clips/ClipTools",()=>({ClipTools:({onShowClips}:{onShowClips:()=>void})=><button onClick={onShowClips}>Clipes do projeto</button>}));
vi.mock("../components/clips/ClipFeedback",()=>({ClipFeedback:()=>null}));
vi.mock("../components/clips/ClipGallery",async()=>{
  const {useState}=await import("react");
  return {ClipGallery:({onEdit}:{onEdit:(entry:LibraryClip)=>void})=>{const [filter,setFilter]=useState("active");return <section aria-label="Galeria preservada"><output data-filter={filter}>{filter}</output><button onClick={()=>setFilter("approved")}>Filtrar aprovados</button><button onClick={()=>onEdit(entry)}>Editar trecho</button></section>;}};
});
vi.mock("../components/editor/VideoEditor",async()=>{
  const {useRef}=await import("react");
  const {useEditorNavigationGuard}=await import("../hooks/useEditorNavigationGuard");
  const {useNavigationGuard}=await import("../hooks/useNavigationGuard");
  return {VideoEditor:({onBack}:{onBack:()=>void})=>{
    const dirty=useRef(false),guard=useNavigationGuard();
    useEditorNavigationGuard({hasUnsavedChanges:()=>dirty.current,save:async()=>{await state.save();dirty.current=false;return true;},discard:async()=>{await state.discard();dirty.current=false;return true;}});
    return <section aria-label="Editor de origem"><button onClick={()=>{dirty.current=true;}}>Alterar trecho</button><button onClick={()=>void guard?.requestNavigation(onBack)}>Voltar à origem</button></section>;
  }};
});
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
beforeEach(async()=>{state.data=emptyWorkspace();state.data.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};await import("../components/editor/VideoEditor");});
afterEach(async()=>{await view?.close();view=undefined;vi.clearAllMocks();});
async function mount(){view=await reactHost(<App/>);await view.click("Biblioteca global");}
function gallery(){return Array.from(view!.host.querySelectorAll<HTMLElement>('[aria-label="Galeria preservada"]')).find(element=>!element.closest("[hidden]"));}
async function openGlobal(){await mount();await view!.click("Clipes (1)");await view!.click("Filtrar aprovados");view!.host.querySelector(".panel-body")!.scrollTop=420;await view!.click("Editar trecho");await vi.waitFor(()=>expect(view!.host.querySelector('[aria-label="Editor de origem"]')).not.toBeNull());}
async function openProject(){await mount();await act(async()=>view!.host.querySelector<HTMLButtonElement>('[data-testid="project-card"]')!.click());await view!.click("Clipes do projeto");await view!.click("Filtrar aprovados");view!.host.querySelector(".panel-body")!.scrollTop=240;await view!.click("Editar trecho");}

it.each(["Salvar e sair","Descartar e sair"])("retorna à biblioteca global com filtro/rolagem após %s",async decision=>{
  await openGlobal();
  expect(view!.host.querySelector('[aria-label="Editor de origem"]')).not.toBeNull();
  await view!.click("Alterar trecho");await view!.click("Voltar à origem");await view!.click("Continuar editando");
  expect(view!.host.querySelector('[aria-label="Editor de origem"]')).not.toBeNull();
  await view!.click("Voltar à origem");await view!.click(decision);
  expect(view!.host.querySelector('[aria-label="Editor de origem"]')).toBeNull();
  expect(gallery()?.querySelector("[data-filter]")?.textContent).toBe("approved");
  expect(view!.host.querySelector(".panel-body")!.scrollTop).toBe(420);
  expect(decision==="Salvar e sair"?state.save:state.discard).toHaveBeenCalledOnce();
});
it.each(["Salvar e sair","Descartar e sair"])("retorna aos clipes do projeto com filtro/rolagem após %s",async decision=>{
  await openProject();await view!.click("Alterar trecho");await view!.click("Voltar à origem");await view!.click(decision);
  expect(view!.host.querySelector('[aria-label="Editor de origem"]')).toBeNull();
  expect(gallery()?.querySelector("[data-filter]")?.textContent).toBe("approved");
  expect(view!.host.querySelector('[aria-label="Visão geral do projeto"]')).toBeNull();
  expect(view!.host.querySelector(".panel-body")!.scrollTop).toBe(240);
  expect(decision==="Salvar e sair"?state.save:state.discard).toHaveBeenCalledOnce();
});
