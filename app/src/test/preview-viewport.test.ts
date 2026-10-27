import { describe, expect, it } from "vitest";
import { boundPreviewCamera, centerPreviewAt, previewGeometry, zoomPreviewAt } from "../lib/preview-viewport";

const size = { width: 800, height: 600 };
const output = { width: 1920, height: 1080 };
const initial = { zoom: 1, x: 0, y: 0 };

describe("visualização da prévia sem modificar a montagem", () => {
  it("mantém o ponto sob o mouse ao ampliar, quando há espaço para navegar", () => {
    const next = zoomPreviewAt(size, output, initial, 2, { x: 600, y: 300 });
    expect(next).toEqual({ zoom: 2, x: -200, y: 0 });
    const geometry = previewGeometry(size, output, next);
    expect(geometry.visible.left).toBeCloseTo(.375);
    expect(geometry.visible.width).toBeCloseTo(.5);
  });

  it("reduz até 25%, limita em 400% e volta ao centro sem acumular deslocamento", () => {
    expect(boundPreviewCamera(size, output, { zoom: .001, x: 9000, y: -8000 })).toEqual({ zoom: .25, x: 0, y: 0 });
    expect(boundPreviewCamera(size, output, { zoom: 100, x: 9000, y: -8000 })).toEqual({ zoom: 4, x: 1200, y: -600 });
    expect(boundPreviewCamera(size, output, { zoom: 1, x: 99, y: 99 })).toEqual(initial);
  });

  it("move pela miniatura e conserva os limites do quadro nas extremidades", () => {
    expect(centerPreviewAt(size, output, { zoom: 2, x: 0, y: 0 }, { x: 1, y: 1 })).toEqual({ zoom: 2, x: -400, y: -150 });
    const camera = centerPreviewAt(size, output, { zoom: 2, x: 0, y: 0 }, { x: 0, y: 0 });
    const geometry = previewGeometry(size, output, camera);
    expect(geometry.visible.left).toBe(0);
    expect(geometry.visible.top).toBe(0);
    expect(geometry.visible.height).toBeCloseTo(2 / 3);
  });

  it("considera as barras laterais de um projeto vertical e o redimensionamento do painel", () => {
    const portrait = { width: 1080, height: 1920 };
    const camera = boundPreviewCamera(size, portrait, { zoom: 2, x: 400, y: -600 });
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(-300);
    expect(previewGeometry(size, portrait, camera).visible.width).toBe(1);
    const resized = boundPreviewCamera({ width: 400, height: 600 }, portrait, camera);
    expect(resized.zoom).toBe(2);
    expect(resized.x).toBe(0);
  });

  it("não produz NaN para tamanho ainda não medido ou eventos inválidos", () => {
    expect(boundPreviewCamera({ width: 0, height: 0 }, output, { zoom: NaN, x: Infinity, y: NaN })).toEqual(initial);
    const geometry = previewGeometry({ width: 0, height: 0 }, output, initial);
    expect(geometry.visible).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(zoomPreviewAt(size, output, initial, NaN, { x: 0, y: 0 })).toEqual(initial);
  });
});
