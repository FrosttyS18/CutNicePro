import { expect, it } from "vitest";
import { defaultSplitScreen, isSplitScreen, splitLayoutAt, splitViewport, updateSplitPanel } from "../lib/split-screen";
import { defaultEditorSettings } from "../lib/workspace";

const panels = defaultSplitScreen();
const scenes = { ...panels, faceValidated: true,
  shots: [{ sourceStart: 103.72, sourceEnd: 112.95, top: panels.top, bottom: panels.bottom }] };

it("usa duas regiões somente na cena confirmada e preserva os closes", () => {
  expect(splitLayoutAt(scenes, 103.72)).toMatchObject(panels);
  expect(splitLayoutAt(scenes, 112.94)).toMatchObject(panels);
  expect(splitLayoutAt(scenes, 112.95)).toBeNull();
  expect(splitLayoutAt(scenes, 150)).toBeNull();
  expect(splitLayoutAt(scenes, 0)).toBeNull();
  expect(splitLayoutAt({ ...panels, faceValidated: true }, 150)).toMatchObject(panels);
});

it("recusa janelas inválidas, invertidas e sobrepostas da composição", () => {
  expect(isSplitScreen(scenes)).toBe(true);
  expect(isSplitScreen({ ...scenes, shots: [] })).toBe(false);
  expect(isSplitScreen({ ...scenes, shots: [{ ...scenes.shots[0], sourceEnd: NaN }] })).toBe(false);
  expect(isSplitScreen({ ...scenes, shots: [{ ...scenes.shots[0], sourceEnd: 103 }] })).toBe(false);
  expect(isSplitScreen({ ...scenes, shots: [scenes.shots[0], scenes.shots[0]] })).toBe(false);
  expect(isSplitScreen({ ...scenes, shots: [{ ...scenes.shots[0], top: { x: 200, y: 0, zoom: 1 } }] })).toBe(false);
});

it("envia a área visível para selecionar as duas pessoas centrais do quadro amplo", () => {
  const viewport = splitViewport(1920, 1080, { ...defaultEditorSettings(), ratio: "9:16", fit: "cover" });
  expect(viewport?.x).toBeCloseTo(0.341796875);
  expect(viewport?.width).toBeCloseTo(0.31640625);
  expect(viewport?.y).toBe(0);
  expect(viewport?.height).toBe(1);
  expect(splitViewport(1920, 1080, { ...defaultEditorSettings(), fit: "contain" })).toBeUndefined();
});

it("ajusta somente a pessoa da cena em edição e conserva as demais cenas", () => {
  const layout = { ...scenes, shots: [...scenes.shots, { ...scenes.shots[0], sourceStart: 150, sourceEnd: 160 }] };
  const next = updateSplitPanel(layout, 155, "top", { x: 25 });
  expect(next.shots?.[1].top.x).toBe(25);
  expect(next.shots?.[0].top).toEqual(layout.shots[0].top);
  expect(next.shots?.[1].bottom).toEqual(layout.shots[1].bottom);
  expect(updateSplitPanel(layout, 120, "top", { x: 25 })).toBe(layout);
});
