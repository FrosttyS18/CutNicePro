import { act, type ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { UploadScreen } from "../screens/UploadScreen";
import { reactHost } from "./react-host";

const native = vi.hoisted(() => ({ open: vi.fn(), listen: vi.fn(async () => vi.fn()) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: native.open }));
vi.mock("@tauri-apps/api/event", () => ({ listen: native.listen }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });

const props = () => ({ projects: [], loading: false, error: null, onRetry: vi.fn(), onOpen: vi.fn(),
  onViewAll: vi.fn(), onDelete: vi.fn(async () => {}), onCreate: vi.fn(async () => {}) });
type ImportHandler = NonNullable<ComponentProps<typeof UploadScreen>["onFilePath"]>;
const prepare: NonNullable<Parameters<typeof reactHost>[1]> = (environment) => {
  const prototype = environment.HTMLElement.prototype;
  const matches = prototype.matches;
  Object.defineProperty(prototype, "showPopover", { configurable: true, value() {} });
  Object.defineProperty(prototype, "hidePopover", { configurable: true, value() {} });
  Object.defineProperty(prototype, "matches", { configurable: true, value(this: HTMLElement, selector: string) {
    return selector === ":popover-open" ? false : matches.call(this, selector);
  } });
  vi.stubGlobal("requestAnimationFrame", environment.requestAnimationFrame.bind(environment));
  vi.stubGlobal("cancelAnimationFrame", environment.cancelAnimationFrame.bind(environment));
};

it("seleciona arquivo sem iniciar e importa somente com as opções escolhidas", async () => {
  native.open.mockResolvedValue("C:\\Videos\\Entrevista.mp4");
  const onFilePath = vi.fn<ImportHandler>().mockResolvedValue(undefined);
  mounted = await reactHost(<UploadScreen {...props()} onFilePath={onFilePath} />, prepare);
  await mounted.click("Enviar");
  expect(onFilePath).not.toHaveBeenCalled();
  expect(mounted.host.textContent).toContain("Entrevista.mp4");
  await mounted.click("Editar vídeo");
  await mounted.chooseOption("Objetivo", "Legendar");
  await act(async () => mounted!.host.querySelector<HTMLButtonElement>('button[aria-label="Enquadramento"]')!.click());
  await act(async () => Array.from(mounted!.host.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.startsWith("Preencher 9:16"))!.click());
  await mounted.click("Legendas");
  await mounted.chooseOption("Estilo de legenda", "Karaokê");
  await mounted.click("Importar vídeo");
  expect(onFilePath).toHaveBeenCalledTimes(1);
  expect(onFilePath.mock.calls[0]).toEqual(["C:\\Videos\\Entrevista.mp4", "Entrevista",
    { tool: "captions", ratio: "9:16", fit: "cover", model: 3 }, expect.any(Function), expect.any(AbortSignal)]);
});

it("apresenta uma barra de arquivo e opções compactas sem formulário de campos", async () => {
  mounted = await reactHost(<UploadScreen {...props()} onFilePath={vi.fn()} />, prepare);
  const form = mounted.host.querySelector("form")!;
  expect(form.querySelector('.upload-composer__toolbar')).not.toBeNull();
  expect(form.querySelectorAll('input:not([type="hidden"])')).toHaveLength(0);
  expect(form.querySelector("fieldset")).toBeNull();
  expect(form.querySelector('button[type="submit"]')?.getAttribute("aria-label")).toBe("Importar vídeo");
});

it("preserva seleção e permite tentar novamente após erro", async () => {
  native.open.mockResolvedValue("C:\\Videos\\Entrevista.mp4");
  const onFilePath = vi.fn().mockRejectedValueOnce(new Error("Disco cheio")).mockResolvedValue(undefined);
  mounted = await reactHost(<UploadScreen {...props()} onFilePath={onFilePath} />);
  await mounted.click("Enviar");
  await mounted.click("Importar vídeo");
  expect(mounted.host.textContent).toContain("Disco cheio");
  expect(mounted.host.textContent).toContain("Entrevista.mp4");
  await mounted.click("Tentar novamente");
  expect(onFilePath).toHaveBeenCalledTimes(2);
});

it("bloqueia envio duplicado e cancela a tentativa própria antes de liberar retry", async () => {
  native.open.mockResolvedValue("C:\\Videos\\Entrevista.mp4");
  let signal: AbortSignal | undefined;
  let reject: ((reason: Error) => void) | undefined;
  const onFilePath = vi.fn<ImportHandler>((_path, _name, _options, _progress, currentSignal) => {
    signal = currentSignal;
    return new Promise<void>((_resolve, fail) => { reject = fail; });
  });
  mounted = await reactHost(<UploadScreen {...props()} onFilePath={onFilePath} />);
  await mounted.click("Enviar");
  await mounted.click("Importar vídeo");
  const submit = mounted.host.querySelector<HTMLButtonElement>('button[type="submit"]');
  expect(submit?.disabled).toBe(true);
  await mounted.click("Cancelar importação");
  expect(signal?.aborted).toBe(true);
  expect(submit?.disabled).toBe(true);
  await act(async () => reject?.(new DOMException("Cancelado", "AbortError")));
  expect(mounted.host.textContent).toContain("Importação cancelada");
  expect(onFilePath).toHaveBeenCalledTimes(1);
});
