import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorInspector } from "../components/editor/EditorInspector";
import { defaultEditorSettings } from "../lib/workspace";
import { captionPresets } from "../lib/captions";

const noop = () => {};

describe("inspetor do editor (atualização 15 — anatomia SupoClip)", () => {
  it("abas horizontais Legendas/Enquadrar/Áudio/Efeitos com ícone e rótulo", () => {
    const html = renderToStaticMarkup(<EditorInspector panel="captions" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} />);
    for (const nome of ["Legendas", "Enquadrar", "Áudio", "Efeitos"]) expect(html).toContain(`>${nome}</span>`);
    expect(html).not.toContain("<span>Texto</span>"); // aba Texto não existe mais
    expect((html.match(/class="studio-tab"/g) ?? []).length).toBe(4);
  });
  it("aba Legendas: switch mestre, cartões de preset, y contínuo, palavras por legenda, salvar/carregar/aplicar", () => {
    const html = renderToStaticMarkup(<EditorInspector panel="captions" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} />);
    expect(html).toContain('role="switch"'); expect(html).toContain("Mostrar legendas");
    expect((html.match(/class="studio-preset"/g) ?? []).length).toBe(3);
    expect(html).toContain("Limpo"); expect(html).toContain("Destaque"); expect(html).toContain("Pop");
    expect(html).toContain("Posição vertical"); expect(html).toContain("<strong>86%</strong>");
    expect(html).toContain("Palavras por legenda"); expect(html).toContain("<span>5</span>");
    expect(html).toContain("Ver todos os 10 estilos"); // acessível por aria-label
    expect(html).toContain('aria-label="Ver todos os 10 estilos"'); // ícone animado, sem modal
    expect(html).not.toContain('aria-haspopup="dialog"'); // nenhum modal de estilos
    expect(html).toContain("Destacar palavra falada"); expect(html).toContain("Fundo do texto"); expect(html).toContain("MAIÚSCULAS");
    expect(html).toContain("Cor do texto da legenda"); expect(html).toContain("Cor do destaque");
    expect(html).toContain("Salvar estilo"); expect(html).toContain("Carregar estilo"); expect(html).toContain("Aplicar a todos os cortes");
    expect(html).not.toContain("role=\"list\""); // sem transcrição duplicada no inspetor
  });
  it("aba Enquadrar: toggles de proporção com Original, ajuste, zoom e centralizar", () => {
    const html = renderToStaticMarkup(<EditorInspector panel="reframe" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} />);
    expect(html).toContain("Original"); expect(html).toContain("Vertical"); expect(html).toContain("Quadrado");
    expect(html).toContain("Preencher quadro"); expect(html).toContain("Vídeo completo");
    expect(html).toContain('aria-label="Zoom"'); expect(html).toContain('step="0.01"'); expect(html).toContain("Posição horizontal"); expect(html).toContain("Posição vertical");
    expect(html).toContain("Centralizar assunto");
  });
  it("aba Áudio: volume até 200% e silenciar exportação; aba Efeitos com reset", () => {
    const audio = renderToStaticMarkup(<EditorInspector panel="audio" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} />);
    expect(audio).toContain("Volume:"); expect(audio).toContain("<strong>100%</strong>"); expect(audio).toContain('max="200"');
    expect(audio).toContain("Silenciar áudio da exportação"); expect(audio).toContain("entram na exportação");
    const effects = renderToStaticMarkup(<EditorInspector panel="effects" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} />);
    for (const nome of ["Brilho", "Contraste", "Saturação", "Desfoque", "Matiz"]) expect(effects).toContain(nome);
    expect(effects).toContain("Restaurar"); expect(effects).toContain("legendas continuam nítidas");
  });
  it("texto sobre o vídeo preservado dentro da aba Legendas; preset aplica y real", () => {
    const html = renderToStaticMarkup(<EditorInspector panel="captions" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} />);
    expect(html).toContain("Texto sobre o vídeo");
    const karaoke = { ...defaultEditorSettings(), captionModel: 3, captionStyle: { ...captionPresets[3].style } };
    const k = renderToStaticMarkup(<EditorInspector panel="captions" settings={karaoke} onPanel={noop} onSettings={noop} />);
    expect(k).toContain('id="caption-uppercase" role="switch" aria-checked="true"'); // preset Karaokê é uppercase
    expect(k).toContain("Sua <span"); // cartões com prévia real
  });
});

import { captionCue } from "../lib/captions";
import type { TranscriptSegment } from "../lib/workspace-types";

describe("agrupamento de palavras por legenda (atualização 15)", () => {
  const palavras = (textos: string[], inicios: number[]) =>
    textos.map((text, i) => ({ text, start: inicios[i], end: inicios[i] + 0.3 }));
  const segmento = (words: { text: string; start: number; end: number }[]): TranscriptSegment[] =>
    [{ id: "s", start: words[0].start, end: words[words.length - 1].end, text: words.map(w => w.text).join(" "), words }];

  it("com 5 palavras por legenda, agrupa até 5 palavras contíguas", () => {
    const words = palavras(["a", "b", "c", "d", "e", "f", "g"], [1, 1.4, 1.8, 2.2, 2.6, 3.0, 3.4]);
    const cue = captionCue(segmento(words), 1.0, 5);
    expect(cue?.words.map(w => w.text)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("com 2 palavras por legenda, o grupo mostra no máximo 2", () => {
    const words = palavras(["a", "b", "c", "d", "e", "f", "g"], [1, 1.4, 1.8, 2.2, 2.6, 3.0, 3.4]);
    const cue = captionCue(segmento(words), 1.0, 2);
    expect(cue?.words.map(w => w.text)).toEqual(["a", "b"]);
    const cueFim = captionCue(segmento(words), 3.0, 2);
    expect(cueFim?.words.map(w => w.text)).toEqual(["e", "f"]);
  });
  it("pausa maior que 0,6s fecha o grupo antes do limite de palavras", () => {
    const words = palavras(["a", "b", "c", "d"], [1, 1.4, 3.0, 3.4]);
    const cue = captionCue(segmento(words), 3.0, 5);
    expect(cue?.words.map(w => w.text)).toEqual(["c", "d"]);
  });
  it("sem tempos por palavra, mostra o texto integral (comportamento antigo preservado)", () => {
    const segmentoSemTempos: TranscriptSegment[] = [{ id: "s", start: 1, end: 4, text: "texto completo", words: [] }];
    const cue = captionCue(segmentoSemTempos, 2, 2);
    expect(cue?.words.map(w => w.text)).toEqual(["texto", "completo"]);
  });
});
