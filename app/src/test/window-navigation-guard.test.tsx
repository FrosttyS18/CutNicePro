import { act, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWindowNavigationGuard } from "../hooks/useWindowNavigationGuard";
import { NavigationGuard, type UnsavedWork } from "../lib/navigation-guard";
import { reactHost } from "./react-host";

type CloseHandler = (event: { preventDefault: () => void }) => void | Promise<void>;
const native = vi.hoisted(() => ({
  destroy: vi.fn<() => Promise<void>>(),
  listen: vi.fn<(handler: CloseHandler) => Promise<() => void>>(),
  handlers: [] as CloseHandler[],
  stops: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  onCloseRequested: native.listen, destroy: native.destroy,
}) }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let guard: NavigationGuard;
const onError = vi.fn<(message: string) => void>();

function Harness() {
  useWindowNavigationGuard(guard, onError);
  return null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function dirtySource() {
  const state = { dirty: true };
  const source: UnsavedWork = {
    hasUnsavedChanges: () => state.dirty,
    save: vi.fn(async () => { state.dirty = false; return true; }),
    discard: vi.fn(async () => { state.dirty = false; return true; }),
  };
  guard.register(source);
  return { source, state };
}

async function requestClose(index = native.handlers.length - 1) {
  const event = { preventDefault: vi.fn() };
  await native.handlers[index](event);
  if (!event.preventDefault.mock.calls.length) await native.destroy();
  return event;
}

beforeEach(() => {
  guard = new NavigationGuard();
  native.handlers = [];
  native.stops = [];
  native.destroy.mockReset().mockResolvedValue(undefined);
  native.listen.mockReset().mockImplementation(async handler => {
    native.handlers.push(handler);
    const stop = vi.fn();
    native.stops.push(stop);
    return stop;
  });
  onError.mockReset();
});

afterEach(async () => {
  guard.dispose();
  await mounted?.close();
  mounted = undefined;
});

describe("fechamento e ciclo de vida da janela", () => {
  it("observa falha ao fechar uma janela limpa e permite tentar novamente", async () => {
    native.destroy.mockRejectedValueOnce(new Error("Janela ocupada"));
    mounted = await reactHost(<Harness />);
    await expect(requestClose()).resolves.toBeDefined();
    expect(onError).toHaveBeenCalledWith("Janela ocupada");
    expect(native.destroy).toHaveBeenCalledOnce();
    await requestClose();
    expect(native.destroy).toHaveBeenCalledTimes(2);
  });

  it("não envia dois fechamentos enquanto o primeiro aguarda o nativo", async () => {
    const closing = deferred<void>();
    native.destroy.mockReturnValueOnce(closing.promise);
    mounted = await reactHost(<Harness />);
    const first = requestClose();
    await requestClose();
    expect(native.destroy).toHaveBeenCalledOnce();
    closing.resolve();
    await first;
  });

  it("libera o listener no unload uma única vez mesmo desmontando depois", async () => {
    mounted = await reactHost(<Harness />);
    window.dispatchEvent(new window.Event("unload"));
    expect(native.stops[0]).toHaveBeenCalledOnce();
    await mounted.close();
    mounted = undefined;
    expect(native.stops[0]).toHaveBeenCalledOnce();
  });

  it("libera uma inscrição que termina somente depois do unload", async () => {
    const registration = deferred<() => void>();
    const stop = vi.fn();
    native.listen.mockReturnValueOnce(registration.promise);
    mounted = await reactHost(<Harness />);
    window.dispatchEvent(new window.Event("unload"));
    await act(async () => { registration.resolve(stop); });
    expect(stop).toHaveBeenCalledOnce();
  });

  it("não fecha por callback nativo atrasado depois de desmontar", async () => {
    mounted = await reactHost(<Harness />);
    await mounted.close();
    mounted = undefined;
    await requestClose();
    expect(native.destroy).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("StrictMode limpa a primeira inscrição e ignora seu callback antigo", async () => {
    mounted = await reactHost(<StrictMode><Harness /></StrictMode>);
    expect(native.handlers).toHaveLength(2);
    expect(native.stops[0]).toHaveBeenCalledOnce();
    await requestClose(0);
    expect(native.destroy).not.toHaveBeenCalled();
    await requestClose(1);
    expect(native.destroy).toHaveBeenCalledOnce();
  });

  it("beforeunload cancelado mantém a proteção nativa e o rascunho", async () => {
    const { state } = dirtySource();
    mounted = await reactHost(<Harness />);
    const event = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(native.stops[0]).not.toHaveBeenCalled();
    const closing = requestClose();
    expect(guard.getSnapshot().open).toBe(true);
    guard.cancel();
    await closing;
    expect(state.dirty).toBe(true);
    expect(native.destroy).not.toHaveBeenCalled();
  });

  it("fecha uma vez após descarte e suprime pedido duplicado no diálogo", async () => {
    const { source, state } = dirtySource();
    mounted = await reactHost(<Harness />);
    const first = requestClose();
    await requestClose();
    expect(native.destroy).not.toHaveBeenCalled();
    await guard.confirm("discard");
    await first;
    expect(state.dirty).toBe(false);
    expect(source.discard).toHaveBeenCalledOnce();
    expect(native.destroy).toHaveBeenCalledOnce();
  });

  it.each(["falha", "nova edição"])("%s no salvamento mantém o rascunho aberto", async mode => {
    const { source, state } = dirtySource();
    source.save = mode === "falha" ? vi.fn(async () => { throw new Error("Disco cheio"); }) : vi.fn(async () => true);
    mounted = await reactHost(<Harness />);
    const closing = requestClose();
    await guard.confirm("save");
    expect(guard.getSnapshot()).toMatchObject({ open: true, busy: false, error: expect.any(String) });
    expect(state.dirty).toBe(true);
    expect(native.destroy).not.toHaveBeenCalled();
    guard.cancel();
    await closing;
  });

  it.each(["unmount", "unload"])("não fecha após salvar se houve %s durante a gravação", async mode => {
    const { source, state } = dirtySource();
    const saving = deferred<void>();
    source.save = async () => { await saving.promise; state.dirty = false; return true; };
    mounted = await reactHost(<Harness />);
    const closing = requestClose();
    const confirmation = guard.confirm("save");
    if (mode === "unmount") {
      await mounted.close();
      mounted = undefined;
    } else window.dispatchEvent(new window.Event("unload"));
    saving.resolve();
    await confirmation;
    await closing;
    expect(native.destroy).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reporta erro e permite repetir o fechamento se o nativo falha após salvar", async () => {
    const { source, state } = dirtySource();
    native.destroy.mockRejectedValueOnce(new Error("Janela ocupada"));
    mounted = await reactHost(<Harness />);
    const closing = requestClose();
    await guard.confirm("save");
    await closing;
    expect(onError).toHaveBeenCalledWith("Janela ocupada");
    expect(state.dirty).toBe(false);
    expect(guard.getSnapshot().open).toBe(false);
    await requestClose();
    expect(native.destroy).toHaveBeenCalledTimes(2);
    expect(source.save).toHaveBeenCalledOnce();
  });

  it("beforeunload durante destroy não confunde aprovação já concluída com rascunho pendente", async () => {
    dirtySource();
    let prevented: boolean | undefined;
    native.destroy.mockImplementationOnce(async () => {
      const event = new window.Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });
    mounted = await reactHost(<Harness />);
    const closing = requestClose();
    await guard.confirm("save");
    await closing;
    expect(prevented).toBe(false);
    expect(native.destroy).toHaveBeenCalledOnce();
  });

  it("uma edição entre aprovação e fechamento impede destroy e permite pedir novamente", async () => {
    const { state } = dirtySource();
    const request = guard.requestNavigation;
    vi.spyOn(guard, "requestNavigation").mockImplementationOnce(async action => {
      const allowed = await request(action);
      state.dirty = true;
      return allowed;
    });
    mounted = await reactHost(<Harness />);
    const closing = requestClose();
    await guard.confirm("save");
    await closing;
    expect(native.destroy).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("alterações novas"));
    const retry = requestClose();
    expect(guard.getSnapshot().open).toBe(true);
    guard.cancel();
    await retry;
  });

  it("reporta falha de inscrição ativa sem fechar a janela", async () => {
    native.listen.mockRejectedValueOnce(new Error("Listener indisponível"));
    mounted = await reactHost(<Harness />);
    expect(onError).toHaveBeenCalledWith("Listener indisponível");
    expect(native.destroy).not.toHaveBeenCalled();
  });
});
