import { afterEach,describe,expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultEditorSettings,emptyWorkspace } from "../lib/workspace";
import { openClipWorkspace,fullVideoWorkspace,captureClipEdits } from "../lib/clip-workspace";
import { isolatedClipSettings,parseClips,type Clip } from "../lib/clips";
import { VideoPreview } from "../components/workspace/VideoPreview";
import { ClipTranscript } from "../components/clips/ClipTranscript";
import { clipParagraphs } from "../lib/clip-transcript";
import { readWorkspace,saveWorkspace } from "../services/workspace-store";
import { captionPresentation,effectiveCaptionStyle } from "../lib/captions";
import { ClipFormatPicker } from "../components/clips/ClipFormatPicker";
import { TranscriptionSetup } from "../components/workspace/TranscriptionSetup";
import { ClipDetails } from "../components/clips/ClipDetails";

const clip: Clip = {id:"a".repeat(64),start:10,end:30,title:"Um assunto",score:80,reasons:[],review:"pending",format:"9:16"};
afterEach(()=>vi.unstubAllGlobals());
describe("original e edições isolados",()=>{
  it("mostra quadro original sem legenda, texto, crop ou proporção editada",()=>{
    const html = renderToStaticMarkup(<VideoPreview original media={{kind:"local",name:"fonte",width:640,height:360,duration:100,url:null,videoId:null}}
      localUrl="video.mp4" settings={{...defaultEditorSettings(),ratio:"9:16",fit:"cover",text:"Texto editado",muted:true}}
      cue={{words:[{text:"Legenda",active:true,spoken:true}]}}/>);
    expect(html).toContain("aspect-ratio:1.7777777777777777");expect(html).toContain("object-fit:contain");
    expect(html).not.toContain("caption-overlay");expect(html).not.toContain("Texto editado");
  });
  it("troca cortes e restaura o vídeo completo sem compartilhar preferências",()=>{
    const video = {...emptyWorkspace(),settings:{...defaultEditorSettings(),ratio:"1:1" as const,text:"Vídeo completo"}};
    const first = openClipWorkspace(video,clip);
    expect(first.settings.ratio).toBe("9:16");expect(first.settings.text).toBe("");
    const edited = captureClipEdits({...first,settings:{...first.settings,ratio:"4:5",text:"Primeiro clipe"}});
    const second = openClipWorkspace(edited,{...clip,id:"b".repeat(64),format:"16:9"});
    expect(second.settings.ratio).toBe("16:9");expect(second.settings.text).toBe("");
    expect(openClipWorkspace(second,clip).settings.text).toBe("Primeiro clipe");
    expect(fullVideoWorkspace(second).settings).toEqual(video.settings);
    expect(isolatedClipSettings({...clip,format:undefined}).ratio).toBe("16:9");
    expect(isolatedClipSettings({...clip,format:undefined},undefined,{width:1080,height:1920}).ratio).toBe("9:16");
    expect(isolatedClipSettings(clip,undefined,{width:1920,height:1080}).ratio).toBe("9:16");
  });
  it("persiste preferências por corte e rejeita configurações corrompidas",()=>{
    const store = new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)});
    const data = captureClipEdits(openClipWorkspace(emptyWorkspace(),clip));saveWorkspace("p",data);
    expect(readWorkspace("p").clipEdits?.[clip.id].ratio).toBe("9:16");
    const corrupted = {...data,clipEdits:{[clip.id]:{...data.settings,ratio:"invalid"}}};store.set("cnp.workspace.v1.p",JSON.stringify(corrupted));
    // atualização 16: campo corrompido é corrigido isoladamente — o projeto
    // NÃO pode virar vazio por causa de uma entrada inválida
    expect(readWorkspace("p").version).toBe(2);
    expect(readWorkspace("p").clipEdits?.[clip.id]?.ratio).toBe("16:9");
  });
  it("aceita formato persistido, preserva legado e recusa formato desconhecido",()=>{
    const collection={version:1,mediaId:"m",transcriptHash:"h",clips:[clip]};
    expect(parseClips(collection).clips[0].format).toBe("9:16");
    expect(parseClips({...collection,clips:[{...clip,format:undefined}]}).clips).toHaveLength(1);
    expect(()=>parseClips({...collection,clips:[{...clip,format:"3:4"}]})).toThrow();
  });
});
describe("controles de corte e modelo",()=>{
  it("oferece quatro formatos nomeados e seletor compacto sem lista nativa",()=>{
    const format=renderToStaticMarkup(<ClipFormatPicker value="9:16" onChange={()=>undefined}/>);
    expect(format.match(/type="radio"/g)).toHaveLength(4);expect(format.match(/checked=""/g)).toHaveLength(1);expect(format).toContain('value="9:16"');expect(format).toContain("Formato dos clipes");
    const model=renderToStaticMarkup(<TranscriptionSetup open busy={false} profile="turbo" cpuOnly={false}
      profiles={[{id:"turbo",available:true},{id:"large",available:true}]} onProfile={()=>undefined} onCpu={()=>undefined} onClose={()=>undefined} onStart={()=>undefined}/>);
    expect(model).toContain("transcription-setup");expect(model).toContain("Large v3 Turbo");expect(model).not.toContain("<select");expect(model).not.toContain('type="radio"');
  });
  it("mostra análise específica e evidências, sem a explicação genérica anterior",()=>{
    const analysis={title:"Skins do PUBG e ruído no computador",summary:"Os participantes falam do valor de itens do PUBG e depois do ruído no PC durante a live.",
      criteria:["Gancho","Desenvolvimento","Fechamento"].map(label=>({label,score:60,explanation:"O assunto muda para o computador e termina sem solução.",evidence:"Tem que botar uma proteção aí"}))};
    const html=renderToStaticMarkup(<ClipDetails clip={{...clip,analysis}} transcript={[]} time={10} loading={false} analyzing={false} error={null} onSeek={()=>undefined} onAnalyze={()=>undefined}/>);
    expect(html).toContain("valor de itens do PUBG");expect(html).toContain("Tem que botar uma proteção");expect(html).not.toContain("A nota estima");
    const pending=renderToStaticMarkup(<ClipDetails clip={clip} transcript={[]} time={10} loading={false} analyzing error={null} onSeek={()=>undefined} onAnalyze={()=>undefined}/>);
    expect(pending).toContain("Analisando o trecho");expect(pending).not.toContain("/100");
  });
  it("escala texto vertical pela largura de exportação, sem ampliar para 608px",()=>{
    const style=effectiveCaptionStyle(2);
    expect(captionPresentation(style,9/16).fontSize).toContain(String(style.size/1080));
    expect(captionPresentation(style,16/9).fontSize).toContain(String(style.size/1920));
  });
});
describe("transcrição em parágrafos",()=>{
  const segments=Array.from({length:30},(_,i)=>({id:String(i),start:i,end:i+1,text:"Duas palavras.",words:[{text:"Duas",start:i,end:i+.4},{text:"palavras.",start:i+.4,end:i+1}]}));
  it("agrupa segmentos pequenos em texto contínuo e preserva tempos e espaços",()=>{
    const paragraphs=clipParagraphs(segments,0,30);expect(paragraphs).toHaveLength(1);expect(paragraphs[0]).toHaveLength(60);
    const html=renderToStaticMarkup(<ClipTranscript segments={segments} start={0} end={30} time={.2} onSeek={()=>undefined}/>);
    expect(html).toContain("Duas</button> <button");expect(html.match(/<p>/g)).toHaveLength(1);expect(html).toContain('data-active="true"');
  });
  it("limita o intervalo e faz quebra em pausa sem inventar palavra ou tempo",()=>{
    const input=[segments[0],{...segments[1],start:4,end:5,words:undefined}];
    expect(clipParagraphs(input,0,6)).toHaveLength(2);
    const words=clipParagraphs(segments,5.4,6).flat();expect(words).toHaveLength(1);expect(words[0].text).toBe("palavras.");expect(words[0].start).toBe(5.4);
  });
});
