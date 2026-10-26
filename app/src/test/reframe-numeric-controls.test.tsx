import { act, useState } from "react";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { EditorInspector } from "../components/editor/EditorInspector";
import { CompositionPlacementControls } from "../components/editor/CompositionPlacementControls";
import { InspectorNumberField } from "../components/editor/InspectorNumberField";
import { defaultEditorSettings } from "../lib/workspace";
import type { EditorSettings, SplitScreenSettings } from "../lib/workspace-types";
import { reactHost } from "./react-host";

const bootstrap = await vi.hoisted(async () => {
  const { Window } = await import("happy-dom");
  const environment = new Window({ url: "http://localhost" });
  vi.stubGlobal("window", environment);
  vi.stubGlobal("document", environment.document);
  return environment;
});
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });
afterAll(async () => { await bootstrap.happyDOM.cancelAsync(); vi.unstubAllGlobals(); });

async function inspector(initial: EditorSettings, sourceTime = 0) {
  const change = vi.fn();
  function Controlled() {
    const [settings, setSettings] = useState(initial);
    return <EditorInspector panel="reframe" settings={settings} sourceTime={sourceTime} onPanel={() => {}}
      onSettings={patch => { change(patch); setSettings(current => ({ ...current, ...patch })); }}/>;
  }
  mounted = await reactHost(<Controlled />);
  return change;
}

function field(label: string) {
  const input = mounted!.host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  expect(input).not.toBeNull();
  return input!;
}
async function draft(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
async function key(input: HTMLElement, value: string) {
  await act(async () => { input.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
}
async function blur(input: HTMLInputElement) {
  await act(async () => { input.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true })); });
}

it("confirma ajustes precisos por teclado sem converter vazio em zero ou arredondar valores salvos", async () => {
  const change = await inspector({ ...defaultEditorSettings(), focalPoint: { x: 44.375, y: 62.5 }, zoom: 1.237 });
  const x = field("Posição horizontal");
  expect(x.type).toBe("number");
  expect(x.value).toBe("44.375");
  expect(field("Zoom").value).toBe("1.237");
  await draft(x, "");
  await key(x, "Enter");
  expect(change).not.toHaveBeenCalled();
  expect(x.value).toBe("44.375");
  await draft(x, "-20");
  expect(change).not.toHaveBeenCalled();
  await key(x, "Enter");
  expect(change).toHaveBeenLastCalledWith({ focalPoint: { x: 0, y: 62.5 } });
  await key(x, "ArrowUp");
  expect(change).toHaveBeenLastCalledWith({ focalPoint: { x: 1, y: 62.5 } });
  await draft(field("Zoom"), "1.75");
  await blur(field("Zoom"));
  expect(change).toHaveBeenLastCalledWith({ zoom: 1.75 });
});

it("edita somente a pessoa e a cena ativas no split", async () => {
  const layout: SplitScreenSettings = { version: 1, faceValidated: true,
    top: { x: 10, y: 20, zoom: 1.1 }, bottom: { x: 70, y: 80, zoom: 1.2 }, shots: [
      { sourceStart: 10, sourceEnd: 20, top: { x: 10, y: 20, zoom: 1.1 }, bottom: { x: 70, y: 80, zoom: 1.2 } },
      { sourceStart: 30, sourceEnd: 40, top: { x: 83, y: 24, zoom: 1.3 }, bottom: { x: 15, y: 62, zoom: 1.4 } },
    ] };
  const change = await inspector({ ...defaultEditorSettings(), ratio: "9:16", splitScreen: layout }, 35);
  const x = field("Posição horizontal da pessoa de cima");
  expect(x.type).toBe("number");
  expect(x.value).toBe("83");
  await draft(x, "25.5");
  await blur(x);
  const updated = change.mock.lastCall![0].splitScreen as SplitScreenSettings;
  expect(updated.shots![1].top).toEqual({ x: 25.5, y: 24, zoom: 1.3 });
  expect(updated.shots![1].bottom).toEqual(layout.shots![1].bottom);
  expect(updated.shots![0]).toEqual(layout.shots![0]);
  expect(updated.top).toEqual(layout.top);
  expect(mounted!.host.querySelector('input[aria-label="Zoom"]')).toBeNull();
});

it("mantém escala da camada separada do recorte e respeita bloqueio e restauração", async () => {
  const change = vi.fn();
  const placement = { x: 25.25, y: 62.5, scale: .75, opacity: .33 };
  const render = (disabled: boolean) => <CompositionPlacementControls placement={placement} disabled={disabled} cropping={false} onChange={change}/>;
  mounted = await reactHost(render(false));
  const scale = field("Escala da sobreposição");
  expect(scale.type).toBe("number");
  await draft(scale, "40");
  await blur(scale);
  expect(change).toHaveBeenLastCalledWith({ ...placement, scale: .4 });
  await mounted.click("Restaurar sobreposição");
  expect(change).toHaveBeenLastCalledWith({ x: 50, y: 50, scale: 1, opacity: 1 });
  change.mockClear();
  await mounted.render(render(true));
  expect(field("Escala da sobreposição").disabled).toBe(true);
  await mounted.click("Restaurar sobreposição");
  expect(change).not.toHaveBeenCalled();
});

it("expõe o tooltip da ação por foco e o fecha com Escape sem criar controles no canvas", async () => {
  const change = await inspector(defaultEditorSettings());
  const action = Array.from(mounted!.host.querySelectorAll("button")).find(button => button.textContent?.trim()==="Centralizar assunto")!;
  expect(action).toBeDefined();
  await act(async () => { action.focus(); });
  expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("Centralizar");
  await key(action, "Escape");
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(change).not.toHaveBeenCalled();
  expect(mounted!.host.querySelector("canvas,video,[data-composition-layer]")).toBeNull();
});

it("mostra somente o valor aceito pelo pai quando uma edição é recusada", async () => {
  const change = vi.fn();
  mounted = await reactHost(<InspectorNumberField label="Posição recusada" caption="Horizontal" value={50} min={0} max={100} onChange={change}/>);
  const input = field("Posição recusada");
  await draft(input, "25");
  await key(input, "Enter");
  expect(change).toHaveBeenLastCalledWith(25);
  expect(input.value).toBe("50");
  await draft(input, "75");
  await blur(input);
  expect(change).toHaveBeenLastCalledWith(75);
  expect(input.value).toBe("50");
  await key(input, "ArrowUp");
  expect(change).toHaveBeenLastCalledWith(51);
  expect(input.value).toBe("50");
});

it("descarta o rascunho ao trocar a ocorrência mesmo quando os valores são iguais", async () => {
  const change = vi.fn();
  const settings = defaultEditorSettings();
  const render = (contextKey: string) => <EditorInspector contextKey={contextKey} panel="reframe" settings={settings} onPanel={() => {}} onSettings={change}/>;
  mounted = await reactHost(render("first-occurrence"));
  await draft(field("Posição horizontal"), "25");
  expect(field("Posição horizontal").value).toBe("25");
  await mounted.render(render("second-occurrence"));
  expect(field("Posição horizontal").value).toBe("50");
  await key(field("Posição horizontal"), "Enter");
  expect(change).not.toHaveBeenCalled();
});

it("mantém o rascunho dentro da cena e o descarta ao avançar para outra cena", async () => {
  const change = vi.fn();
  const panel = { x: 50, y: 50, zoom: 1 };
  const settings: EditorSettings = { ...defaultEditorSettings(), ratio: "9:16", splitScreen: {
    version: 1, faceValidated: true, top: { ...panel }, bottom: { ...panel }, shots: [
      { sourceStart: 10, sourceEnd: 20, top: { ...panel }, bottom: { ...panel } },
      { sourceStart: 30, sourceEnd: 40, top: { ...panel }, bottom: { ...panel } },
    ],
  } };
  const render = (sourceTime: number) => <EditorInspector contextKey="same-occurrence" panel="reframe" settings={settings} sourceTime={sourceTime} onPanel={() => {}} onSettings={change}/>;
  mounted = await reactHost(render(15));
  await draft(field("Posição horizontal da pessoa de cima"), "25");
  await mounted.render(render(16));
  expect(field("Posição horizontal da pessoa de cima").value).toBe("25");
  await mounted.render(render(35));
  expect(field("Posição horizontal da pessoa de cima").value).toBe("50");
  await key(field("Posição horizontal da pessoa de cima"), "Enter");
  expect(change).not.toHaveBeenCalled();
});
