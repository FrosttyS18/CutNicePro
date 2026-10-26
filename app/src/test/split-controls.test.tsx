import { act, useState } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorInspector } from "../components/editor/EditorInspector";
import { defaultEditorSettings } from "../lib/workspace";
import { defaultSplitScreen } from "../lib/split-screen";
import type { EditorSettings } from "../lib/workspace-types";
import { reactHost } from "./react-host";

const { suggestSplitScreen, bootstrap } = await vi.hoisted(async () => {
  const { Window } = await import("happy-dom");
  const bootstrap = new Window({ url: "http://localhost" });
  vi.stubGlobal("window", bootstrap);
  vi.stubGlobal("document", bootstrap.document);
  return { suggestSplitScreen: vi.fn(), bootstrap };
});
vi.mock("../lib/ipc", () => ({ suggestSplitScreen }));

const source = { projectId: "project", mediaId: "media", start: 10, end: 30 };
const found = { status: "found", message: "Duas pessoas localizadas.",
  layout: { version: 1, faceValidated: true, top: { x: 12, y: 47, zoom: 1.2 }, bottom: { x: 86, y: 52, zoom: 1.1 } } };
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;

beforeEach(() => suggestSplitScreen.mockReset());
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.restoreAllMocks(); });
afterAll(async () => { await bootstrap.happyDOM.cancelAsync(); vi.unstubAllGlobals(); });

async function inspector(settings: EditorSettings, localSource: typeof source | null = source) {
  const onSettings = vi.fn();
  function Controlled() {
    const [current, setCurrent] = useState(settings);
    return <EditorInspector panel="reframe" settings={current} source={localSource ?? undefined} onPanel={() => {}}
      onSettings={patch => { onSettings(patch); setCurrent(old => ({ ...old, ...patch })); }} />;
  }
  mounted = await reactHost(<Controlled />);
  return { ...mounted, onSettings };
}

function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(done => { resolve = done; });
  suggestSplitScreen.mockReturnValueOnce(promise);
  return async (value = found) => { await act(async () => resolve(value)); };
}

function button(text: string) {
  const target = Array.from(mounted!.host.querySelectorAll("button")).find(item => item.textContent?.trim() === text);
  if (!target) throw new Error(`Botão ausente: ${text}`);
  return target;
}

async function slider(label: string, value: string) {
  const input = mounted!.host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`Controle ausente: ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

describe("composição de duas pessoas no inspetor", () => {
  it("não inventa um segundo painel quando não há duas pessoas confirmadas", async () => {
    suggestSplitScreen.mockResolvedValue({ status: "manual", message: "Não encontramos duas pessoas no mesmo quadro." });
    const ui = await inspector(defaultEditorSettings());
    await ui.click("Duas pessoas (empilhadas)");
    expect(suggestSplitScreen).toHaveBeenCalledWith(source);
    expect(ui.onSettings).not.toHaveBeenCalled();
    expect(ui.host.textContent).toContain("Não encontramos duas pessoas no mesmo quadro.");
    expect(ui.host.querySelector('input[name="split-cima-x"]')).toBeNull();
  });
  it("ativa 9:16 somente com duas regiões detectadas e limpa ao trocar proporção", async () => {
    suggestSplitScreen.mockResolvedValue(found);
    const ui = await inspector({ ...defaultEditorSettings(), ratio: "16:9" });
    await ui.click("Duas pessoas (empilhadas)");
    expect(ui.onSettings).toHaveBeenLastCalledWith({ ratio: "9:16", splitScreen: found.layout });
    expect(ui.host.querySelector('button[aria-label="Vertical"]')?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { ui.host.querySelector<HTMLButtonElement>('button[aria-label="Quadrado"]')!.click(); });
    expect(ui.onSettings).toHaveBeenLastCalledWith({ ratio: "1:1", splitScreen: null });
    expect(ui.host.querySelector('input[aria-label="Zoom"]')).not.toBeNull();
  });

  it("substitui os controles globais por posições e zoom independentes", async () => {
    const ui = await inspector({ ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen() });
    expect(ui.host.querySelector('[aria-label="Ajuste do vídeo"]')).toBeNull();
    expect(ui.host.querySelector('input[aria-label="Zoom"]')).toBeNull();
    expect(ui.host.querySelector('input[aria-label="Posição horizontal"]')).toBeNull();
    await slider("Posição horizontal da pessoa de cima", "25");
    expect(ui.onSettings).toHaveBeenLastCalledWith({ splitScreen: { ...defaultSplitScreen(), top: { x: 25, y: 50, zoom: 1 } } });
    await slider("Zoom da pessoa de baixo", "1.75");
    expect(ui.onSettings.mock.lastCall?.[0].splitScreen.bottom).toEqual({ x: 100, y: 50, zoom: 1.75 });
    await ui.click("Quadro único");
    expect(ui.onSettings).toHaveBeenLastCalledWith({ splitScreen: null });
  });

  it("desativa a busca e explica a falta de mídia local", async () => {
    await inspector({ ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen() }, null);
    expect(button("Localizar duas pessoas").disabled).toBe(true);
    expect(mounted!.host.textContent).toContain("Conecte um vídeo local");
    expect(suggestSplitScreen).not.toHaveBeenCalled();
  });

  it("mostra carregamento e aplica somente uma sugestão local válida", async () => {
    const resolve = pending();
    const ui = await inspector({ ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen() });
    await ui.click("Localizar duas pessoas");
    expect(button("Localizando…").disabled).toBe(true);
    expect(suggestSplitScreen).toHaveBeenCalledWith(source);
    await resolve();
    expect(ui.onSettings).toHaveBeenLastCalledWith({ splitScreen: found.layout });
    expect(ui.host.textContent).toContain(found.message);
  });

  it("mantém os painéis quando a análise pede ajuste manual", async () => {
    suggestSplitScreen.mockResolvedValue({ status: "manual", message: "As duas pessoas não puderam ser isoladas." });
    const ui = await inspector({ ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen() });
    await ui.click("Localizar duas pessoas");
    expect(ui.onSettings).not.toHaveBeenCalled();
    expect(ui.host.querySelector('[role="status"]')?.textContent).toContain("não puderam ser isoladas");
  });

  it("rejeita um retorno inválido sem alterar os ajustes", async () => {
    suggestSplitScreen.mockResolvedValue({ ...found, layout: { ...found.layout, top: { x: 120, y: 50, zoom: 1 } } });
    const ui = await inspector({ ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen() });
    await ui.click("Localizar duas pessoas");
    expect(ui.onSettings).not.toHaveBeenCalled();
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain("Resposta de enquadramento inválida");
  });

  it("permite tentar novamente após falha nativa", async () => {
    suggestSplitScreen.mockRejectedValueOnce("Vídeo indisponível. Reconecte o arquivo.");
    const ui = await inspector({ ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen() });
    await ui.click("Localizar duas pessoas");
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain("Reconecte");
    expect(button("Localizar duas pessoas").disabled).toBe(false);
  });

  it("ignora a sugestão pendente após um ajuste manual", async () => {
    const resolve = pending();
    const ui = await inspector({ ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen() });
    await ui.click("Localizar duas pessoas");
    await slider("Posição horizontal da pessoa de cima", "35");
    await resolve();
    expect(ui.onSettings).toHaveBeenCalledTimes(1);
    expect(ui.onSettings.mock.calls[0][0].splitScreen.top.x).toBe(35);
    expect(ui.host.textContent).not.toContain(found.message);
  });

  it.each(["projectId", "mediaId", "start", "end"] as const)("ignora a sugestão após mudar %s", async key => {
    const resolve = pending();
    const onSettings = vi.fn();
    const settings = { ...defaultEditorSettings(), ratio: "9:16" as const, splitScreen: defaultSplitScreen() };
    const render = (localSource: typeof source) => <EditorInspector panel="reframe" settings={settings} source={localSource}
      onPanel={() => {}} onSettings={onSettings} />;
    mounted = await reactHost(render(source));
    await mounted.click("Localizar duas pessoas");
    await mounted.render(render({ ...source, [key]: typeof source[key] === "number" ? 20 : "changed" }));
    await resolve();
    expect(onSettings).not.toHaveBeenCalled();
    expect(mounted.host.textContent).not.toContain(found.message);
  });

  it("ignora a resposta depois de desmontar o inspetor", async () => {
    const resolve = pending();
    const ui = await inspector({ ...defaultEditorSettings(), ratio: "9:16", splitScreen: defaultSplitScreen() });
    await ui.click("Localizar duas pessoas");
    await ui.close(); mounted = undefined;
    await resolve();
    expect(ui.onSettings).not.toHaveBeenCalled();
  });
});
