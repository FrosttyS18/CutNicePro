import { beforeEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { defaultSplitScreen, isSplitScreen, splitPanelGeometry } from "../lib/split-screen";
import { defaultEditorSettings, emptyWorkspace } from "../lib/workspace";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { renderSettings } from "../lib/clips";

beforeEach(() => Object.defineProperty(globalThis, "localStorage", { value: new Window().localStorage, configurable: true }));

describe("split screen", () => {
  it("recorta duas regiões distintas sem esticar ou sair da fonte", () => {
    const layout = defaultSplitScreen();
    const top = splitPanelGeometry(1920, 1080, layout.top);
    const bottom = splitPanelGeometry(1920, 1080, layout.bottom);
    expect(top.outputWidth).toBe(1080);
    expect(top.outputHeight).toBe(960);
    expect(top.cropX).toBe(0);
    expect(bottom.cropX).toBe(bottom.scaledWidth - 1080);
    for (const panel of [top, bottom]) {
      expect(panel.sourceX).toBeGreaterThanOrEqual(0);
      expect(panel.sourceY).toBeGreaterThanOrEqual(0);
      expect(panel.sourceX + panel.sourceWidth).toBeLessThanOrEqual(1920.000001);
      expect(panel.sourceY + panel.sourceHeight).toBeLessThanOrEqual(1080.000001);
    }
  });

  it("valida versão, coordenadas e zoom dos dois painéis", () => {
    expect(isSplitScreen(defaultSplitScreen())).toBe(true);
    expect(isSplitScreen({ ...defaultSplitScreen(), version: 2 })).toBe(false);
    expect(isSplitScreen({ ...defaultSplitScreen(), bottom: { x: 101, y: 50, zoom: 1 } })).toBe(false);
    expect(isSplitScreen({ ...defaultSplitScreen(), top: { x: 0, y: NaN, zoom: 1 } })).toBe(false);
    expect(() => splitPanelGeometry(0, 1080, defaultSplitScreen().top)).toThrow();
  });

  it("mantém o split na reabertura e no contrato de export sem alterar trim", () => {
    const data = emptyWorkspace();
    data.settings = { ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen(), trimStart: 2, trimEnd: 8 };
    expect(saveWorkspace("split-test", data)).toBe(true);
    const reopened = readWorkspace("split-test");
    expect(reopened.settings.splitScreen).toEqual(data.settings.splitScreen);
    expect(renderSettings(reopened.settings)).toMatchObject({ splitScreen: data.settings.splitScreen, trimStart: 2, trimEnd: 8 });
  });

  it("preserva configurações antigas e recusa split inválido ao salvar", () => {
    const data = emptyWorkspace();
    expect(saveWorkspace("legacy-test", data)).toBe(true);
    expect(readWorkspace("legacy-test").settings.splitScreen).toBeUndefined();
    Object.assign(data.settings, { ratio: "9:16", splitScreen: { ...defaultSplitScreen(), version: 2 } });
    expect(saveWorkspace("invalid-test", data)).toBe(false);
    data.settings = { ...data.settings, splitScreen: defaultSplitScreen(), ratio: "16:9" };
    expect(saveWorkspace("invalid-ratio", data)).toBe(false);
  });
});
