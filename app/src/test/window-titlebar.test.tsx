import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WindowTitlebar } from "../components/WindowTitlebar";
import { reactHost } from "./react-host";

const native = vi.hoisted(() => ({ minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
const onError = vi.fn();
beforeEach(() => { for (const method of Object.values(native)) method.mockReset().mockResolvedValue(undefined); onError.mockReset(); });
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.restoreAllMocks(); });

describe("controles nativos da janela", () => {
  it.each([
    ["Minimizar", "minimize", "Não foi possível minimizar a janela. Tente novamente."],
    ["Maximizar ou restaurar", "toggleMaximize", "Não foi possível ajustar a janela. Tente novamente."],
    ["Fechar", "close", "Não foi possível fechar a janela. Salve suas alterações e tente novamente."],
  ] as const)("observa falha de %s e permite nova tentativa", async (label, method, message) => {
    const error = "runtime error: failed to send message to the webview";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    native[method].mockRejectedValueOnce(error);
    mounted = await reactHost(<WindowTitlebar onError={onError} />);
    const button = mounted.host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    await act(async () => button.click());
    expect(onError).toHaveBeenCalledWith(message);
    expect(warning).toHaveBeenCalledWith(`[CutNicePro:window:${method}]`, error);
    await act(async () => button.click());
    expect(native[method]).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("não repete o mesmo comando enquanto a primeira solicitação não terminou", async () => {
    let release!: () => void;
    native.minimize.mockReturnValueOnce(new Promise<void>(resolve => { release = resolve; }));
    mounted = await reactHost(<WindowTitlebar onError={onError} />);
    const button = mounted.host.querySelector<HTMLButtonElement>('[aria-label="Minimizar"]')!;
    await act(async () => { button.click(); button.click(); });
    expect(native.minimize).toHaveBeenCalledOnce();
    await act(async () => release());
    await act(async () => button.click());
    expect(native.minimize).toHaveBeenCalledTimes(2);
  });
});
