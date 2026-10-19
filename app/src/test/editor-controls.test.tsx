import { afterEach,describe,expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { captionCue,captionPresets,captionPresentation,effectiveCaptionStyle,isCaptionStyle } from "../lib/captions";
import { defaultEditorSettings,emptyWorkspace } from "../lib/workspace";
import { readWorkspace,saveWorkspace } from "../services/workspace-store";
import { formatPlaybackTime,playbackBounds,shouldTogglePlayback } from "../lib/playback";
import { menuIndex,menuPosition,projectMenuItems } from "../lib/project-menu";
import { PlaybackControls } from "../components/editor/PlaybackControls";
import { CaptionPresetsDialog } from "../components/editor/CaptionPresetsDialog";
import { CaptionFontControls } from "../components/editor/CaptionFontControls";
import { CaptionEffectControls } from "../components/editor/CaptionEffectControls";
import { CaptionVisual } from "../components/editor/CaptionVisual";
import { ProjectsScreen } from "../screens/ProjectsScreen";
import { TranscriptionControls } from "../components/workspace/TranscriptionControls";
import type { useTranscription } from "../hooks/useTranscription";

const noop=()=>{};
function memoryStorage(){const values=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});return values;}
afterEach(()=>vi.unstubAllGlobals());
describe("editor 03I sem navegador",()=>{
  it("aplica estilos legados e rejeita fonte, cores e limites inválidos",()=>{
    expect(effectiveCaptionStyle(6).font).toBe("Impact");
    expect(captionPresets.every(preset=>isCaptionStyle(preset.style))).toBe(true);
    expect(isCaptionStyle({...captionPresets[1].style,font:"url(remote)"})).toBe(false);
    expect(isCaptionStyle({...captionPresets[1].style,size:NaN})).toBe(false);
    expect(isCaptionStyle({...captionPresets[1].style,color:"red; background:url(x)"})).toBe(false);
    expect(isCaptionStyle({...captionPresets[1].style,outline:30})).toBe(false);
  });
  it("salva e reabre os ajustes sem mudar a mídia ou transcrição",()=>{
    memoryStorage();const workspace=emptyWorkspace();
    workspace.settings.captionStyle={...captionPresets[3].style,font:"Georgia",size:80,italic:true};
    workspace.transcript=[{id:"s",start:0,end:1,text:"Olá",words:[{text:"Olá",start:0,end:1}]}];
    expect(saveWorkspace("p",workspace)).toBe(true);
    expect(readWorkspace("p")).toEqual(workspace);
  });
  it("recupera preferência visual inválida sem apagar conteúdo ou regravar o arquivo",()=>{
    const storage=memoryStorage();const workspace=emptyWorkspace();workspace.settings.text="Preservado";
    const raw=JSON.stringify({...workspace,settings:{...workspace.settings,captionStyle:{font:"unknown"}}});
    storage.set("cnp.workspace.v1.p",raw);
    const restored=readWorkspace("p");
    expect(restored.settings.text).toBe("Preservado");expect(restored.settings.captionStyle).toBeUndefined();
    expect(storage.get("cnp.workspace.v1.p")).toBe(raw);
    expect(defaultEditorSettings().captionStyle).toBeUndefined();
  });
  it("mostra grupos de palavras sincronizados e respeita os intervalos sem fala",()=>{
    const words=Array.from({length:12},(_,i)=>({text:`palavra${i}`,start:i,end:i+.6}));
    const segments=[{id:"s",start:0,end:12,text:words.map(w=>w.text).join(" "),words}];
    const cue=captionCue(segments,6.2)!;
    expect(cue.words.map(w=>w.text)).toEqual(["palavra5","palavra6","palavra7","palavra8","palavra9"]);
    expect(cue.words.filter(w=>w.active).map(w=>w.text)).toEqual(["palavra6"]);
    expect(captionCue(segments,6.8)?.words.some(w=>w.active)).toBe(false);
    expect(captionCue(segments,13)).toBeNull();
  });
  it("predefinições, fonte e efeitos usam nomes úteis sem avisos internos",()=>{
    const html=renderToStaticMarkup(<CaptionPresetsDialog open model={2} onModel={noop} onStyle={noop} onClose={noop}/>);
    expect(html).toContain("Predefinições");expect(html).toContain("Fonte");expect(html).toContain("Efeitos");
    expect(html).toContain("Destaque");expect(html).not.toMatch(/Modelo \d|integração|aguarda|implementação|próxima etapa/);
    const fields=renderToStaticMarkup(<CaptionFontControls style={captionPresets[2].style} onChange={noop}/>);
    expect(fields).toContain("Georgia");expect(fields).toContain("Tamanho");expect(fields).toContain("Maiúsculas");
    const effects=renderToStaticMarkup(<CaptionEffectControls style={captionPresets[2].style} onChange={noop}/>);
    expect(effects).toContain("Contorno");expect(effects).toContain("Karaokê");expect(effects).toContain("Fundo da legenda");
  });
  it("apresentação e destaque refletem a fonte e o efeito escolhidos",()=>{
    const style={...captionPresets[2].style,font:"Impact" as const,highlightColor:"#aabbcc"};
    expect(captionPresentation(style).fontFamily).toContain("Impact");
    const html=renderToStaticMarkup(<CaptionVisual sample style={style} cue={{words:[{text:"Fala",active:true,spoken:true}]}}/>);
    expect(html).toContain("#aabbcc");expect(html).toContain('data-active="true"');
  });
  it("o transporte limita início/fim ao trecho e mostra centésimos",()=>{
    expect(playbackBounds(120,15,90)).toEqual([15,90]);expect(playbackBounds(10,20,100)).toEqual([10,10]);
    expect(formatPlaybackTime(14.23)).toBe("00:14.23");expect(formatPlaybackTime(59.999)).toBe("01:00.00");
    const html=renderToStaticMarkup(<PlaybackControls time={14.23} start={10} end={60} duration={90} playing={false} enabled onSeek={noop} onToggle={noop}/>);
    expect(html).toContain('aria-label="Ir para o início"');expect(html).toContain('aria-label="Ir para o fim"');expect(html).toContain('aria-keyshortcuts="Space"');
  });
  it("espaço não interfere na digitação, diálogos, modificadores ou repetição",()=>{
    const input={key:" ",repeat:false,modified:false,interactive:false,dialogOpen:false};
    expect(shouldTogglePlayback(input)).toBe(true);
    for(const key of ["repeat","modified","interactive","dialogOpen"] as const)expect(shouldTogglePlayback({...input,[key]:true})).toBe(false);
    expect(shouldTogglePlayback({...input,key:"Enter"})).toBe(false);
  });
  it("menu lista somente ações disponíveis e suporta limites/foco de teclado",()=>{
    expect(projectMenuItems(false,false).map(i=>i.id)).toEqual(["collection","delete"]);
    expect(projectMenuItems(true,true,true).map(i=>i.id)).toEqual(["video","collection","srt","txt","remove","delete"]);
    expect(menuPosition(990,790,250,240,1000,800)).toEqual({left:742,top:552});
    expect(menuIndex("ArrowUp",0,5)).toBe(4);expect(menuIndex("ArrowDown",4,5)).toBe(0);expect(menuIndex("End",0,5)).toBe(4);
  });
  it("card novo preserva badge e não sobrepõe lixeira",()=>{
    memoryStorage();const html=renderToStaticMarkup(<ProjectsScreen projects={[{id:"p",name:"Novo vídeo",created_at_ms:0,updated_at_ms:0,last_opened_at_ms:null}]} loading={false} error={null} onRetry={noop} onCreate={noop} onOpen={noop} onDelete={async()=>{}}/>);
    expect(html).toContain('class="pcard__badge">Novo');expect(html).not.toContain("pcard__delete");expect(html).toContain('aria-keyshortcuts="Shift+F10 ContextMenu"');
  });
  it("transcrição concluída não acumula avisos de armazenamento ou salvamento",()=>{
    const controller={job:{jobId:"j",projectId:"p",state:"completed",stage:"saving",progress:100,error:null},loaded:true,ready:true,busy:false,error:null,profiles:[{id:"turbo",available:true}],start:async()=>{},cancel:async()=>true,retry:noop} satisfies ReturnType<typeof useTranscription>;
    const html=renderToStaticMarkup(<TranscriptionControls controller={controller} generated dirty onSave={async()=>true}/>);
    expect(html).toContain("Transcrever novamente");expect(html).not.toContain("Salve suas alterações");expect(html).not.toContain("neste dispositivo");
    expect(html).not.toContain("disabled");
  });
});
