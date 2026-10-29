import { act } from "react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompositionExportDialog } from "../components/editor/CompositionExportDialog";
import { CompositionExportFinished } from "../components/editor/CompositionExportFinished";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";
import { EXPORT_CODECS, type ExportCapabilities } from "../lib/composition-export";

const bootstrap = await vi.hoisted(async () => {
  const { Window } = await import("happy-dom");
  const environment = new Window({ url: "http://localhost" });
  vi.stubGlobal("window", environment); vi.stubGlobal("document", environment.document);
  return environment;
});
const ipc = vi.hoisted(() => ({ chooseEditorExportDirectory: vi.fn(), getEditorExportPreview: vi.fn(), getEditorExportCapabilities: vi.fn(), getEditorExportDestination: vi.fn(), revealEditorExport: vi.fn() }));
vi.mock("../lib/ipc", () => ipc);
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
const defaults = { resolution: "hd1080", quality: "high", codec: "h264", format: "mp4", frameRate: "fps30", bitrateMode: "vbr" } as const;
function supportedCodecs(): ExportCapabilities { return { codecs: EXPORT_CODECS.map(item => ({ codec: item.value, supported: item.value !== "hevcAlpha", ...(item.value === "hevcAlpha" ? { reason: "Canal alfa indisponível neste computador." } : {}) })) }; }
function props() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "Vídeo.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  const document = compositionFromLegacy(workspace);
  document.settings.ratio = "16:9";
  return { open: true, title: "Montagem", document, projectId: "project", clipId: null, busy: false, onClose: vi.fn(), onExport: vi.fn() };
}
async function changeName(value: string) {
  const input = view!.host.querySelector<HTMLInputElement>('input[name="exportName"]')!;
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
async function changeBitrate(value: string) {
  const input = view!.host.querySelector<HTMLInputElement>('input[name="exportBitrate"]')!;
  await act(async () => {
    input.focus(); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true })); input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
function optionLabels(label: string): string[] { return Array.from(view!.host.querySelectorAll<HTMLElement>(`[role="listbox"][aria-label="${label}"] [role="option"]`), item => item.textContent ?? ""); }
async function submit() { await act(async () => view!.host.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); }
beforeEach(() => {
  vi.clearAllMocks();
  ipc.getEditorExportPreview.mockRejectedValue(new Error("Prévia indisponível"));
  ipc.getEditorExportCapabilities.mockResolvedValue(supportedCodecs());
  ipc.getEditorExportDestination.mockReset().mockResolvedValue({ exists: false, fileName: "Montagem.mp4" });
  ipc.chooseEditorExportDirectory.mockResolvedValue(null);
  ipc.revealEditorExport.mockResolvedValue(undefined);
});
afterEach(async () => { await view?.close(); view = undefined; vi.restoreAllMocks(); });
afterAll(async () => { await bootstrap.happyDOM.cancelAsync(); vi.unstubAllGlobals(); });

it("configura cinco seletores reais sem metadados fixos nem redes", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  expect(view.host.textContent).toContain("MP4"); expect(view.host.textContent).toContain("H.264");
  expect(view.host.textContent).toContain("30 fps"); expect(view.host.textContent).not.toMatch(/pixels|da edição|1920 × 1080/);
  expect(view.host.textContent).toContain("00:10");
  expect(view.host.querySelectorAll('[aria-haspopup="listbox"]')).toHaveLength(5);
  expect(view.host.querySelector(".composition-export__metadata")).toBeNull();
  expect(view.host.querySelector('input[name="exportName"]')?.getAttribute("maxlength")).toBe("120");
  expect(view.host.querySelector("video")).toBeNull(); expect(view.host.textContent).not.toMatch(/TikTok|YouTube|Instagram|Premium|direitos autorais/);
  await view.click("Cancelar"); expect(input.onClose).toHaveBeenCalledOnce(); expect(input.onExport).not.toHaveBeenCalled();
});

it("falha na miniatura permite exportar nome aparado e bloqueia duplo envio", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  expect(view.host.textContent).toContain("Não foi possível carregar a prévia");
  await changeName("  Entrevista final  "); await submit(); await submit();
  expect(ipc.getEditorExportDestination).not.toHaveBeenCalled();
  expect(input.onExport).toHaveBeenCalledTimes(1);
  expect(input.onExport).toHaveBeenCalledWith({ fileName: "Entrevista final", directory: null, options: defaults });
  expect(ipc.getEditorExportPreview).toHaveBeenCalledWith("project", null, input.document);
});

it("valida nome vazio, caracteres de arquivo e comprimento também no submit", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  for (const value of ["   ", "arquivo/erro", "a".repeat(121)]) {
    await changeName(value); await submit(); expect(view.host.querySelector('[role="alert"]')).not.toBeNull();
  }
  expect(input.onExport).not.toHaveBeenCalled();
});

it("resolução e taxa de bits alteram opções enviadas", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  await view.chooseOption("Resolução", "720p"); await view.chooseOption("Taxa de bits", "Menor");
  await submit(); expect(input.onExport).toHaveBeenCalledWith(expect.objectContaining({ options: { ...defaults, resolution: "hd720", quality: "smaller" } }));
});

it("seletores continuam disponíveis em mídia menor sem mostrar metadados removidos", async () => {
  const input = props(); input.document.settings.ratio = "original";
  input.document.assets[0].width = 640; input.document.assets[0].height = 360;
  view = await reactHost(<CompositionExportDialog {...input}/>); await view.chooseOption("Resolução", "720p");
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Resolução"]')?.textContent).toBe("720p");
  expect(view.host.textContent).not.toMatch(/640 × 360|pixels|da edição/);
});

it("pasta escolhida é enviada e cancelamento da escolha mantém destino", async () => {
  ipc.chooseEditorExportDirectory.mockResolvedValueOnce("C:\\Vídeos").mockResolvedValueOnce(null);
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  const folder = () => view!.host.querySelector<HTMLButtonElement>('[aria-label="Escolher pasta"]')!;
  await act(async () => folder().click()); await act(async () => folder().click());
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportDirectory"]')?.value).toBe("C:\\Vídeos");
  await submit(); expect(input.onExport).toHaveBeenCalledWith(expect.objectContaining({ directory: "C:\\Vídeos" }));
});

it("falha da pasta explica e mantém escolha nativa disponível na exportação", async () => {
  ipc.chooseEditorExportDirectory.mockRejectedValue(new Error("sem acesso"));
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  await act(async () => view!.host.querySelector<HTMLButtonElement>('[aria-label="Escolher pasta"]')!.click());
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível escolher a pasta");
  await submit(); expect(input.onExport).toHaveBeenCalledWith(expect.objectContaining({ directory: null }));
});

it("fechar ignora miniatura e pasta atrasadas de uma sessão anterior", async () => {
  let preview!: (value: number[]) => void; let directory!: (value: string) => void;
  ipc.getEditorExportPreview.mockImplementationOnce(() => new Promise(resolve => { preview = resolve; }));
  ipc.chooseEditorExportDirectory.mockImplementationOnce(() => new Promise(resolve => { directory = resolve; }));
  const input = props(); const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  view = await reactHost(<CompositionExportDialog {...input}/>);
  await act(async () => view!.host.querySelector<HTMLButtonElement>('[aria-label="Escolher pasta"]')!.click());
  await view.render(<CompositionExportDialog {...input} open={false}/>);
  await act(async () => { preview([255, 216, 255, 217]); directory("C:\\Atrasada"); });
  await view.render(<CompositionExportDialog {...input}/>);
  expect(create).not.toHaveBeenCalled();
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportDirectory"]')?.value).toBe("Escolher ao exportar");
});

it("miniatura válida libera object URL ao fechar e imagem quebrada usa fallback", async () => {
  ipc.getEditorExportPreview.mockResolvedValue([255, 216, 255, 217]);
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined); const input = props();
  view = await reactHost(<CompositionExportDialog {...input}/>);
  const image = view.host.querySelector("img")!; expect(image.src).toBe("blob:preview");
  expect(create).toHaveBeenCalledOnce();
  await act(async () => image.dispatchEvent(new window.Event("error")));
  expect(view.host.textContent).toContain("Não foi possível carregar a prévia");
  await view.render(<CompositionExportDialog {...input} open={false}/>); expect(revoke).toHaveBeenCalledWith("blob:preview");
});

it("ocupado bloqueia formulário, cancelar e fechamento por Escape", async () => {
  const input = { ...props(), busy: true }; view = await reactHost(<CompositionExportDialog {...input}/>);
  await view.click("Cancelar"); await submit();
  await act(async () => view!.host.querySelector("dialog")!.dispatchEvent(new window.Event("cancel", { cancelable: true })));
  expect(input.onExport).not.toHaveBeenCalled(); expect(input.onClose).not.toHaveBeenCalled();
});

it("recibo mostra arquivo e tamanho reais, abre pasta pelo ID e trata falha", async () => {
  const receipt = { id: "receipt", path: "C:\\Vídeos\\Entrevista final.mp4", bytes: 1_048_576, reused: true }; const onClose = vi.fn();
  ipc.revealEditorExport.mockRejectedValueOnce(new Error("pasta ausente"));
  view = await reactHost(<CompositionExportFinished receipt={receipt} onClose={onClose}/>);
  expect(view.host.textContent).toContain("Vídeo exportado"); expect(view.host.textContent).toContain("Entrevista final.mp4");
  expect(view.host.textContent).toContain("C:\\Vídeos"); expect(view.host.textContent).toContain("1 MB");
  await view.click("Abrir pasta"); expect(ipc.revealEditorExport).toHaveBeenCalledWith("receipt");
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível abrir a pasta");
  await view.click("Abrir pasta"); expect(ipc.revealEditorExport).toHaveBeenCalledTimes(2);
  await view.click("Fechar"); expect(onClose).toHaveBeenCalledOnce();
});

it("reabre com a configuração do pedido anterior sem exportar automaticamente", async () => {
  const input = props();
  view = await reactHost(<CompositionExportDialog {...input} initialRequest={{ fileName: "Versão anterior", directory: "C:\\Vídeos", options: { resolution: "hd720", quality: "balanced" } }}/>);
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportName"]')?.value).toBe("Versão anterior");
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Taxa de bits"]')?.textContent).toBe("Recomendado");
  await submit(); expect(input.onExport).toHaveBeenCalledWith({ fileName: "Versão anterior", directory: "C:\\Vídeos", options: { ...defaults, resolution: "hd720", quality: "balanced" } });
});

it("Escape fecha configuração e Tab retorna ao primeiro botão, sem exportar", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  const dialog = view.host.querySelector("dialog")!;
  const buttons = dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
  await act(async () => {
    buttons[buttons.length - 1].focus();
    dialog.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  });
  expect(document.activeElement).toBe(buttons[0]);
  await act(async () => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })));
  expect(input.onClose).toHaveBeenCalledOnce(); expect(input.onExport).not.toHaveBeenCalled();
});

it("AppSelect mantém seleção por teclado e devolve foco ao controle", async () => {
  view = await reactHost(<CompositionExportDialog {...props()}/>, environment => {
    const prototype = environment.HTMLElement.prototype; const matches = prototype.matches;
    Object.defineProperty(prototype, "showPopover", { configurable: true, value() {} });
    Object.defineProperty(prototype, "hidePopover", { configurable: true, value() {} });
    Object.defineProperty(prototype, "matches", { configurable: true, value(this: HTMLElement, selector: string) { return selector === ":popover-open" ? false : matches.call(this, selector); } });
    vi.stubGlobal("requestAnimationFrame", environment.requestAnimationFrame.bind(environment));
    vi.stubGlobal("cancelAnimationFrame", environment.cancelAnimationFrame.bind(environment));
  });
  const trigger = view.host.querySelector<HTMLButtonElement>('button[aria-label="Resolução"]')!;
  await act(async () => trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true })));
  const list = view.host.querySelector<HTMLElement>('[role="listbox"][aria-label="Resolução"]')!;
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  await act(async () => list.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  expect(trigger.textContent).toContain("8K"); expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});

it("trocar recibo ignora resposta tardia e não duplica abertura de pasta", async () => {
  let reject!: (reason: Error) => void;
  ipc.revealEditorExport.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const receipt = { id: "old", path: "C:\\Vídeos\\Antigo.mp4", bytes: 100, reused: false };
  view = await reactHost(<CompositionExportFinished receipt={receipt} onClose={vi.fn()}/>);
  await view.click("Abrir pasta");
  expect(view.host.querySelector<HTMLButtonElement>('.dialog-action--secondary')?.disabled).toBe(true);
  await view.render(<CompositionExportFinished receipt={{ ...receipt, id: "new", path: "C:\\Vídeos\\Novo.mp4" }} onClose={vi.fn()}/>);
  await act(async () => reject(new Error("tardia")));
  expect(view.host.querySelector('[role="alert"]')).toBeNull(); expect(view.host.textContent).toContain("Novo.mp4");
  await view.click("Abrir pasta"); expect(ipc.revealEditorExport).toHaveBeenCalledTimes(2);
  expect(ipc.revealEditorExport).toHaveBeenLastCalledWith("new");
});

it("listas correspondem às resoluções, presets, codecs, formatos e FPS solicitados", async () => {
  view = await reactHost(<CompositionExportDialog {...props()}/>);
  expect(optionLabels("Resolução")).toEqual(["480p", "720p", "1080p", "2K", "4K", "8K"]);
  expect(optionLabels("Taxa de bits")).toEqual(["Menor", "Recomendado", "Superior", "Personalizado"]);
  expect(optionLabels("Codec")).toEqual(["H.264", "HEVC", "HEVC (Alpha)", "HEVC (422)", "AV1", "RLE"]);
  expect(optionLabels("Formato")).toEqual(["MOV", "MP4"]);
  expect(optionLabels("Taxa de quadros")).toEqual(["24 fps", "25 fps", "29,97 fps", "30 fps", "50 fps", "59,94 fps", "60 fps"]);
  expect(view.host.querySelector(".composition-export__frame")?.querySelector("video")).toBeNull();
  expect(view.host.querySelector("form")?.lastElementChild?.tagName).toBe("FOOTER");
});

it("HEVC, MOV, 4K, 59,94fps e bitrate custom são enviados sem substituir por padrão", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  await view.chooseOption("Resolução", "4K"); await view.chooseOption("Codec", "HEVC");
  await view.chooseOption("Formato", "MOV"); await view.chooseOption("Taxa de quadros", "59,94 fps");
  await view.chooseOption("Taxa de bits", "Personalizado"); await changeBitrate("18000");
  const cbr = view.host.querySelector<HTMLInputElement>('input[type="radio"][value="cbr"]')!;
  const vbr = view.host.querySelector<HTMLInputElement>('input[type="radio"][value="vbr"]')!;
  expect(cbr.name).toBe(vbr.name); expect(vbr.checked).toBe(true); expect(cbr.checked).toBe(false);
  await act(async () => cbr.click()); expect(cbr.checked).toBe(true); expect(vbr.checked).toBe(false);
  await act(async () => vbr.click()); expect(vbr.checked).toBe(true); expect(cbr.checked).toBe(false);
  await act(async () => cbr.click()); await submit(); await submit();
  expect(input.onExport).toHaveBeenCalledTimes(1);
  expect(input.onExport).toHaveBeenCalledWith(expect.objectContaining({ options: { resolution: "uhd2160", quality: "custom", codec: "hevc", format: "mov", frameRate: "fps5994", bitrateMode: "cbr", bitrateKbps: 18000 } }));
});

it("bitrate custom inválido mantém formulário e não exporta", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>); await view.chooseOption("Taxa de bits", "Personalizado");
  for (const value of ["", "99", "100.5", "500001"]) {
    await changeBitrate(value); await submit();
    expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("100 a 500.000 Kbps");
  }
  expect(input.onExport).not.toHaveBeenCalled();
});

it.each(["Superior", "Recomendado", "Menor"])("trocar CBR personalizado por %s remove modo oculto e bitrate residual", async preset => {
  const input = props();
  view = await reactHost(<CompositionExportDialog {...input} initialRequest={{ fileName: "Montagem", directory: null,
    options: { ...defaults, quality: "custom", bitrateKbps: 18000, bitrateMode: "cbr" } }}/>);
  await view.chooseOption("Taxa de bits", preset);
  expect(view.host.querySelector('input[type="radio"]')).toBeNull();
  await view.chooseOption("Taxa de bits", "Personalizado");
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportBitrate"]')?.value).toBe("18000");
  expect(view.host.querySelector<HTMLInputElement>('input[type="radio"][value="vbr"]')?.checked).toBe(true);
  await act(async () => view!.host.querySelector<HTMLInputElement>('input[type="radio"][value="cbr"]')!.click());
  await view.chooseOption("Taxa de bits", preset); await submit();
  const expectedQuality = preset === "Superior" ? "high" : preset === "Recomendado" ? "balanced" : "smaller";
  expect(input.onExport).toHaveBeenCalledWith(expect.objectContaining({ options: { ...defaults, quality: expectedQuality } }));
});

it("RLE seleciona MOV e impede MP4 e taxa de bits fictícia", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  await view.chooseOption("Taxa de bits", "Personalizado"); await changeBitrate("18000");
  await act(async () => view!.host.querySelector<HTMLInputElement>('input[type="radio"][value="cbr"]')!.click());
  await view.chooseOption("Codec", "RLE");
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Formato"]')?.textContent).toBe("MOV");
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Taxa de bits"]')?.disabled).toBe(true);
  expect(view.host.querySelector('[name="exportBitrate"]')).toBeNull();
  expect(view.host.textContent).toContain("RLE usa compressão sem perdas.");
  await view.chooseOption("Formato", "MP4"); await submit();
  expect(input.onExport).toHaveBeenCalledWith(expect.objectContaining({ options: { ...defaults, codec: "rle", format: "mov" } }));
});

it("HEVC Alpha confirmado em outro computador exige MOV e bloqueia MP4", async () => {
  ipc.getEditorExportCapabilities.mockResolvedValueOnce({ codecs: EXPORT_CODECS.map(item => ({ codec: item.value, supported: true })) });
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  await view.chooseOption("Codec", "HEVC (Alpha)");
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Formato"]')?.textContent).toBe("MOV");
  await view.chooseOption("Formato", "MP4"); await submit();
  expect(input.onExport).toHaveBeenCalledWith(expect.objectContaining({ options: { ...defaults, codec: "hevcAlpha", format: "mov" } }));
});

it("codec não suportado permanece desabilitado e tem explicação em tooltip do produto", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  const alpha = Array.from(view.host.querySelectorAll<HTMLElement>('[role="listbox"][aria-label="Codec"] [role="option"]')).find(item => item.textContent === "HEVC (Alpha)")!;
  expect(alpha.getAttribute("aria-disabled")).toBe("true");
  await act(async () => alpha.click()); expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Codec"]')?.textContent).toBe("H.264");
  await act(async () => view!.host.querySelector<HTMLElement>('[aria-label="Por que alguns codecs estão indisponíveis"]')!.focus());
  expect(view.host.querySelector('[role="tooltip"]')?.textContent).toContain("Canal alfa indisponível neste computador.");
  expect(view.host.querySelector('[title]')).toBeNull();
});

it("capacidade pendente bloqueia envio; erro explica e retry recupera", async () => {
  let reject!: (reason: Error) => void;
  ipc.getEditorExportCapabilities.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Codec"]')?.disabled).toBe(true);
  await submit(); expect(input.onExport).not.toHaveBeenCalled();
  await act(async () => reject(new Error("probe falhou")));
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível verificar os codecs");
  await view.click("Tentar novamente"); expect(ipc.getEditorExportCapabilities).toHaveBeenCalledTimes(2);
  await submit(); expect(input.onExport).toHaveBeenCalledOnce();
});

it("resposta de capacidade incompleta ou codec salvo indisponível não vira suporte falso", async () => {
  ipc.getEditorExportCapabilities.mockResolvedValueOnce({ codecs: [{ codec: "h264", supported: true }] });
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível verificar os codecs");
  await submit(); expect(input.onExport).not.toHaveBeenCalled();
  await view.render(<CompositionExportDialog {...input} open={false}/>);
  await view.render(<CompositionExportDialog {...input} initialRequest={{ fileName: "Alfa", directory: null, options: { ...defaults, codec: "hevcAlpha" } }}/>);
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Canal alfa indisponível");
  await submit(); expect(input.onExport).not.toHaveBeenCalled();
});

it("fechamento ignora capabilities atrasadas de outra sessão", async () => {
  let resolve!: (value: ExportCapabilities) => void;
  ipc.getEditorExportCapabilities.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const input = props(); view = await reactHost(<CompositionExportDialog {...input}/>);
  await view.render(<CompositionExportDialog {...input} open={false}/>); await view.render(<CompositionExportDialog {...input} projectId="next"/>);
  await act(async () => resolve({ codecs: EXPORT_CODECS.map(item => ({ codec: item.value, supported: false })) }));
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Codec"]')?.disabled).toBe(false);
  await submit(); expect(input.onExport).toHaveBeenCalledOnce();
});

it("FPS fracionário da edição é selecionado e taxa fora da lista continua preservável", async () => {
  const input = props(); input.document.fps = { numerator: 30000, denominator: 1001 };
  view = await reactHost(<CompositionExportDialog {...input}/>);
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Taxa de quadros"]')?.textContent).toBe("29,97 fps");
  await view.render(<CompositionExportDialog {...input} open={false}/>); input.document.fps = { numerator: 24000, denominator: 1001 };
  await view.render(<CompositionExportDialog {...input}/>);
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Taxa de quadros"]')?.textContent).toBe("23,976 fps (original)");
  expect(optionLabels("Taxa de quadros")).toContain("30 fps");
  await submit();
  expect(input.onExport).toHaveBeenCalledWith(expect.objectContaining({ options: { ...defaults, frameRate: "original" } }));
});

it("pasta definida verifica destino e exporta diretamente sem confirmação extra quando livre", async () => {
  const input = props(); view = await reactHost(<CompositionExportDialog {...input} initialRequest={{ fileName: "  Entrevista final  ", directory: "C:\\Vídeos", options: defaults }}/>);
  expect(view.host.textContent).not.toContain("Confirme o nome e o destino na janela de salvar.");
  await submit(); await submit();
  expect(ipc.getEditorExportDestination).toHaveBeenCalledTimes(1);
  expect(ipc.getEditorExportDestination).toHaveBeenCalledWith("C:\\Vídeos", "Entrevista final", defaults);
  expect(input.onExport).toHaveBeenCalledTimes(1);
  expect(input.onExport).toHaveBeenCalledWith({ fileName: "Entrevista final", directory: "C:\\Vídeos", options: defaults });
});

it("arquivo existente pede autorização explícita e substitui uma única vez", async () => {
  ipc.getEditorExportDestination.mockResolvedValue({ exists: true, fileName: "Entrevista final.mp4" });
  const input = props(); view = await reactHost(<CompositionExportDialog {...input} initialRequest={{ fileName: "Entrevista final", directory: "C:\\Vídeos", options: defaults }}/>);
  await submit(); expect(input.onExport).not.toHaveBeenCalled();
  const confirmation = view.host.querySelector<HTMLDialogElement>("dialog.composition-export-replace")!;
  expect(confirmation.textContent).toContain("Substituir vídeo?");
  expect(confirmation.textContent).toContain("Entrevista final.mp4 já existe nesta pasta. Deseja substituí-lo?");
  expect(view.host.querySelector("progress")).toBeNull();
  const replace = Array.from(confirmation.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Substituir")!;
  await act(async () => { replace.click(); replace.click(); });
  expect(input.onExport).toHaveBeenCalledTimes(1);
  expect(input.onExport).toHaveBeenCalledWith({ fileName: "Entrevista final", directory: "C:\\Vídeos", options: defaults, overwrite: true });
});

it("cancelar substituição preserva configurações e permite outro pedido", async () => {
  ipc.getEditorExportDestination.mockResolvedValueOnce({ exists: true, fileName: "Final.mp4" });
  const input = props(); view = await reactHost(<CompositionExportDialog {...input} initialRequest={{ fileName: "Final", directory: "C:\\Vídeos", options: { ...defaults, resolution: "uhd2160" } }}/>);
  await submit();
  const confirmation = view.host.querySelector<HTMLDialogElement>("dialog.composition-export-replace")!;
  await act(async () => Array.from(confirmation.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Cancelar")!.click());
  expect(input.onExport).not.toHaveBeenCalled(); expect(input.onClose).not.toHaveBeenCalled();
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportName"]')?.value).toBe("Final");
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportDirectory"]')?.value).toBe("C:\\Vídeos");
  expect(view.host.querySelector<HTMLButtonElement>('[aria-label="Resolução"]')?.textContent).toBe("4K");
  expect(ipc.getEditorExportPreview).toHaveBeenCalledTimes(1);
  await changeName("Outro nome"); await submit();
  expect(ipc.getEditorExportDestination).toHaveBeenLastCalledWith("C:\\Vídeos", "Outro nome", { ...defaults, resolution: "uhd2160" });
  expect(input.onExport).toHaveBeenCalledTimes(1);
});

it.each(["Cancelar", "X", "Escape"])("verificação pendente bloqueia edição e envio, mas %s descarta resultado atrasado", async action => {
  let finish!: (value: { exists: boolean; fileName: string }) => void;
  ipc.getEditorExportDestination.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const input = props(); view = await reactHost(<CompositionExportDialog {...input} initialRequest={{ fileName: "Final", directory: "C:\\Vídeos", options: defaults }}/>);
  await submit(); await submit();
  const dialog = view.host.querySelector<HTMLDialogElement>("dialog.composition-export")!;
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportName"]')?.disabled).toBe(true);
  await act(async () => view!.host.querySelector<HTMLButtonElement>('[aria-label="Escolher pasta"]')!.click());
  expect(ipc.chooseEditorExportDirectory).not.toHaveBeenCalled();
  expect(ipc.getEditorExportDestination).toHaveBeenCalledTimes(1); expect(input.onExport).not.toHaveBeenCalled();
  if (action === "Cancelar") await view.click("Cancelar");
  else await act(async () => {
    if (action === "X") dialog.querySelector<HTMLButtonElement>('[aria-label="Fechar janela"]')!.click();
    else dialog.dispatchEvent(new window.Event("cancel", { cancelable: true }));
  });
  expect(input.onClose).toHaveBeenCalledOnce();
  await act(async () => finish({ exists: false, fileName: "Final.mp4" })); expect(input.onExport).not.toHaveBeenCalled();
});

it("erro de verificação permanece no formulário e permite tentar novamente", async () => {
  ipc.getEditorExportDestination.mockRejectedValueOnce(new Error("sem acesso"));
  const input = props(); view = await reactHost(<CompositionExportDialog {...input} initialRequest={{ fileName: "Final", directory: "C:\\Vídeos", options: defaults }}/>);
  await submit(); expect(input.onExport).not.toHaveBeenCalled();
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível verificar o destino");
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportName"]')?.value).toBe("Final");
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportName"]')?.disabled).toBe(false);
  expect(view.host.querySelector("progress")).toBeNull();
  await submit(); expect(input.onExport).toHaveBeenCalledOnce();
});

it.each([false, true])("resposta de verificação tardia existe=%s não exporta outro projeto nem abre confirmação", async exists => {
  let finish!: (value: { exists: boolean; fileName: string }) => void;
  ipc.getEditorExportDestination.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const input = props(); view = await reactHost(<CompositionExportDialog {...input} initialRequest={{ fileName: "Antigo", directory: "C:\\Vídeos", options: defaults }}/>);
  await submit(); await view.render(<CompositionExportDialog {...input} projectId="next"/>);
  await act(async () => finish({ exists, fileName: "Antigo.mp4" }));
  expect(input.onExport).not.toHaveBeenCalled(); expect(view.host.querySelector("dialog.composition-export-replace")).toBeNull();
  expect(view.host.querySelector<HTMLInputElement>('input[name="exportName"]')?.value).toBe("Montagem");
});
