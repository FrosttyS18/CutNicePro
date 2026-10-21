import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorInspector } from "../components/editor/EditorInspector";
import { defaultEditorSettings } from "../lib/workspace";
import { captionPresets } from "../lib/captions";

const noop = () => {};
const actions = <button type="button">Transcrever novamente</button>;

describe("inspetor do editor (atualização 14)", () => {
  it("aba Legendas expõe somente propriedades reais do estilo de legenda", () => {
    const html = renderToStaticMarkup(<EditorInspector panel="captions" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} onCaptions={noop} tools={actions} />);
    expect(html).toContain('aria-label="Estilo de legenda"'); expect(html).toContain("Essencial");
    expect(html).toContain('aria-label="Fonte da legenda"'); expect(html).toContain("Poppins");
    expect(html).toContain('aria-label="Tamanho da legenda"'); expect(html).toContain("Tamanho: 64");
    expect(html).toContain('aria-label="Posição da legenda"'); expect(html).toContain("Inferior");
    expect(html).toContain('aria-label="Efeito da legenda"'); expect(html).toContain("Karaokê");
    expect(html).toContain("Cor do texto"); expect(html).toContain("Cor do destaque");
    expect(html).toContain("Contorno: 2"); expect(html).toContain("Cor do contorno");
    expect(html).toContain("Sombra"); expect(html).toContain("Sem fundo");
    expect(html).toContain("Itálico"); expect(html).toContain("Sublinhado"); expect(html).toContain("MAIÚSCULAS");
    expect(html).toContain("Ver estilos prontos");
    expect(html).toContain("edite a transcrição no painel esquerdo");
  });
  it("aba Enquadrar concentra proporção, ajuste, área visível e restauração", () => {
    const settings = { ...defaultEditorSettings(), fit: "cover" as const, focalPoint: { x: 30, y: 60 } };
    const html = renderToStaticMarkup(<EditorInspector panel="reframe" settings={settings} onPanel={noop} onSettings={noop} onCaptions={noop} tools={actions} />);
    expect(html).toContain('aria-label="Proporção do vídeo"'); expect(html).toContain("9:16");
    expect(html).toContain('aria-label="Ajuste do vídeo"'); expect(html).toContain("Preencher (corta o excedente)");
    expect(html).toContain("Horizontal: 30"); expect(html).toContain("Vertical: 60");
    expect(html).toContain("Centralizar imagem"); expect(html).toContain("Restaurar enquadramento");
  });
  it("área visível só aparece com Preencher e ações do projeto ficam no rodapé", () => {
    const contain = renderToStaticMarkup(<EditorInspector panel="reframe" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} onCaptions={noop} />);
    expect(contain).not.toContain("Área visível");
    expect(contain).not.toContain('aria-label="Ações do projeto"');
    const withActions = renderToStaticMarkup(<EditorInspector panel="reframe" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} onCaptions={noop} tools={actions} />);
    expect(withActions).toContain('aria-label="Ações do projeto"');
    expect(withActions).toContain("Transcrever novamente");
  });
  it("aba Áudio é honesta: propriedades da prévia, sem efeitos fictícios", () => {
    const html = renderToStaticMarkup(<EditorInspector panel="audio" settings={defaultEditorSettings()} onPanel={noop} onSettings={noop} onCaptions={noop} />);
    expect(html).toContain("Áudio da prévia"); expect(html).toContain("Volume:"); expect(html).toContain("Sem áudio");
    expect(html).not.toContain("Equalizador"); expect(html).not.toContain("Reverberação");
  });
  it("estilo aplicado reflete o preset escolhido (dados reais, não decorativos)", () => {
    const settings = { ...defaultEditorSettings(), captionModel: 3, captionStyle: { ...captionPresets[3].style } };
    const html = renderToStaticMarkup(<EditorInspector panel="captions" settings={settings} onPanel={noop} onSettings={noop} onCaptions={noop} />);
    expect(html).toContain("<span>Karaokê</span>");
    expect(html).toMatch(/<input[^>]*checked[^>]*>\s*MAIÚSCULAS/); // preset Karaokê é uppercase
  });
});
