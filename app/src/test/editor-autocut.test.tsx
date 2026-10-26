import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { nextProgress, constrainPanel } from "../lib/progress-display";
import { clipMessage, clipSettings, isolatedClipSettings, isClipJob, parseClips, type Clip } from "../lib/clips";
import { defaultEditorSettings } from "../lib/workspace";
import { ClipResults } from "../components/clips/ClipResults";
import { VideoPreview } from "../components/workspace/VideoPreview";
import { FramingToolbar } from "../components/editor/FramingToolbar";
import { FloatingPanel } from "../components/workspace/FloatingPanel";
import { FlowDialog } from "../components/workspace/FlowDialog";
import { TranscriptionDialog } from "../components/workspace/TranscriptionDialog";

const noop = () => {};
const clip: Clip = { id: "a".repeat(64), start: 12.5, end: 45, title: "Por que isso acontece?", score: 83, reasons: ["Final com frase concluída"], review: "pending" };
describe("editor e cortes sem navegador", () => {
  it("conta cada inteiro sem inventar avanço quando o motor para", () => {
    let progress = 0;
    const shown: number[] = [];
    for (let i=0;i<55;i++) { progress=nextProgress(progress,45); shown.push(progress); }
    expect(shown.slice(0,45)).toEqual(Array.from({length:45},(_,i)=>i+1));
    expect(shown.slice(45)).toEqual(Array(10).fill(45));
    expect(nextProgress(99,99)).toBe(99); expect(nextProgress(99,100)).toBe(100);
  });
  it("mantém cabeçalho da janela ao alcance após arraste e redimensionamento", () => {
    expect(constrainPanel(-500,-40,480,500,{width:1000,height:800})).toEqual({x:8,y:8});
    expect(constrainPanel(900,700,480,500,{width:1000,height:800})).toEqual({x:512,y:292});
    expect(constrainPanel(50,50,500,700,{width:320,height:500})).toEqual({x:8,y:8});
    const html=renderToStaticMarkup(<FloatingPanel open title="Legendas" onClose={noop}><input aria-label="Texto"/></FloatingPanel>);
    expect(html).toContain('data-modeless="true"'); expect(html).toContain("Mover janela de legendas");
  });
  it("X permanece habilitado no processamento e não libera fechamento de outros modais ocupados", () => {
    const html=renderToStaticMarkup(<TranscriptionDialog open job={{jobId:"j",projectId:"p",state:"running",stage:"transcribing",progress:90,error:null}} onClose={noop} onCancel={async()=>true} onRetry={noop}/>);
    expect(html).toContain("Transcrevendo…"); expect(html).toContain("thinking-orb");
    expect(html).not.toContain('disabled=""'); expect(html).not.toContain("em português");
    const other=renderToStaticMarkup(<FlowDialog open busy title="Salvar" onClose={noop}>Aguarde</FlowDialog>);
    expect(other).toContain('disabled=""');
  });
  it("expõe clique do vídeo e ações de modo no topo; proporção vive no inspetor", () => {
    const settings={...defaultEditorSettings(),fit:"cover" as const,focalPoint:{x:20,y:70}};
    const preview=renderToStaticMarkup(<VideoPreview media={null} localUrl="http://cnplocal.localhost/media.mp4" settings={settings} nativeControls={false} onTogglePlay={noop}/>);
    expect(preview).toContain('aria-label="Reproduzir ou pausar vídeo"'); expect(preview).toContain("object-position:20% 70%");
    expect(preview).not.toContain('controls=""');
    const toolbar=renderToStaticMarkup(<FramingToolbar framing={false} onFraming={noop}/>);
    expect(toolbar).not.toContain("Cortar tempo"); expect(toolbar).toContain("Enquadrar");
    expect(toolbar).not.toContain('aria-label="Proporção do vídeo"'); expect(toolbar).not.toContain('aria-label="Ajuste do vídeo"');
  });
  it("rejeita dados de cortes fora do contrato e eventos de outro motor", () => {
    const value={version:1,mediaId:"m",transcriptHash:"hash",clips:[clip]};
    expect(parseClips(value).clips[0]).toEqual(clip);
    for (const broken of [{...clip,start:-1},{...clip,end:12},{...clip,score:101},{...clip,review:"unknown"}]) expect(()=>parseClips({...value,clips:[broken]})).toThrow();
    expect(()=>parseClips({...value,clips:[clip,clip]})).toThrow();
    expect(isClipJob({jobId:"j",projectId:"p",state:"running",stage:"rendering",progress:42,error:null})).toBe(true);
    expect(isClipJob({jobId:"j",projectId:"p",state:"running",stage:"transcribing",progress:42,error:null})).toBe(false);
  });
  it("abre corte com tempos de origem e legendas do que recebe — upd 20 preserva a escolha (inclusive desativadas)", () => {
    const original={...defaultEditorSettings(),captionModel:0};
    const settings=clipSettings(original,clip);
    expect(settings.trimStart).toBe(12.5); expect(settings.trimEnd).toBe(45);
    // zero é legítimo (legendas desativadas): nunca trocado por outro modelo
    expect(settings.captionModel).toBe(0); expect(original.captionModel).toBe(0);
    expect(clipSettings(defaultEditorSettings(),clip).captionModel).toBe(1);
    // o PADRÃO do clipe (legendas ativas, modelo 2) continua no caminho sem
    // edição salva — isolatedClipSettings, não na troca silenciosa do zero
    expect(isolatedClipSettings(clip,undefined,null).captionModel).toBe(2);
    expect(isolatedClipSettings(clip,{...defaultEditorSettings(),captionModel:0},null).captionModel).toBe(0);
  });
  it("apresenta nota como estimativa e exige aprovação para exportar o corte", () => {
    const html=renderToStaticMarkup(<ClipResults clips={[clip]} busy={false} onOpen={noop} onExport={noop} onReview={async()=>{}}/>);
    expect(html).toContain("Potencial estimado"); expect(html).toContain("Final com frase concluída"); expect(html).toContain("Aprove o corte para exportar");
    const approved=renderToStaticMarkup(<ClipResults clips={[{...clip,review:"approved"}]} busy={false} onOpen={noop} onExport={noop} onReview={async()=>{}}/>);
    expect(approved).not.toContain("Aprove o corte para exportar");
    expect(clipMessage("ffmpeg log C:\\private\\video.mp4 exit 1")).not.toMatch(/private|exit 1/);
  });
});
