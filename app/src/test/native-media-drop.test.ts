import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscribeNativeMediaDrop } from "../lib/native-media-drop";

const native = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ listen: native.listen }) }));
type Callback = (event: { payload: { paths: string[]; position: { x: number; y: number } } }) => void;
const controllers: AbortController[] = [];
let handlers: { event: string; callback: Callback; off: ReturnType<typeof vi.fn> }[];
let warn: ReturnType<typeof vi.spyOn>;
function controller() { const value = new AbortController(); controllers.push(value); return value; }
async function flush() { for (let index = 0; index < 15; index++) await Promise.resolve(); }
beforeEach(() => {
  handlers = []; native.listen.mockReset(); warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  native.listen.mockImplementation(async (event: string, callback: Callback) => {
    const off = vi.fn(async () => undefined); handlers.push({ event, callback, off }); return off;
  });
});
afterEach(async () => { for (const value of controllers.splice(0)) value.abort(); await flush(); vi.restoreAllMocks(); });

it("registra quatro eventos fixos e entrega somente depois da inscrição completa", async () => {
  const signal = controller(); const receive = vi.fn(); await subscribeNativeMediaDrop(receive, signal.signal);
  expect(handlers.map(item => item.event)).toEqual(["tauri://drag-enter", "tauri://drag-over", "tauri://drag-drop", "tauri://drag-leave"]);
  handlers[2].callback({ payload: { paths: ["C:/Video.mp4"], position: { x: 123, y: 456 } } });
  expect(receive).toHaveBeenCalledWith({ payload: { type: "drop", paths: ["C:/Video.mp4"], position: { x: 123, y: 456 } } });
  signal.abort(); await flush(); expect(handlers.every(item => item.off.mock.calls.length === 1)).toBe(true);
});

it("erro transitório desfaz inscrição parcial antes de uma única repetição sem duplicar handlers", async () => {
  const normal = native.listen.getMockImplementation()!; let calls = 0;
  let release!: () => void;
  native.listen.mockImplementation(async (event: string, callback: Callback) => {
    calls++; if (calls === 3) throw "event listen temporarily unavailable";
    const off = await normal(event, callback);
    if (calls === 1) { off.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })); }
    return off;
  });
  const receive = vi.fn(); const ready = subscribeNativeMediaDrop(receive, controller().signal); await flush();
  expect(native.listen).toHaveBeenCalledTimes(3); release(); await ready;
  expect(native.listen).toHaveBeenCalledTimes(7); expect(handlers[0].off).toHaveBeenCalledOnce(); expect(handlers[1].off).toHaveBeenCalledOnce();
  for (const entry of handlers.filter(item => item.event === "tauri://drag-enter" || item.event === "tauri://drag-drop")) entry.callback({ payload: { paths: ["C:/Video.mp4"], position: { x: 1, y: 2 } } });
  expect(receive).toHaveBeenCalledTimes(2); expect(warn).toHaveBeenCalledWith("[CutNicePro:native-media-drop:listen]", "event listen temporarily unavailable");
});

it("duas falhas ativas preservam o erro cru, limpam e encerram sem repetição infinita", async () => {
  const error = new Error("event.listen denied"); native.listen.mockRejectedValue(error);
  await expect(subscribeNativeMediaDrop(vi.fn(), controller().signal)).rejects.toBe(error);
  expect(native.listen).toHaveBeenCalledTimes(2); expect(warn).toHaveBeenCalledTimes(2);
  expect(warn).toHaveBeenLastCalledWith("[CutNicePro:native-media-drop:listen]", error);
});

it("cancelar antes do primeiro microtask não registra nem gera diagnóstico de falha", async () => {
  const signal = controller(); const ready = subscribeNativeMediaDrop(vi.fn(), signal.signal); signal.abort(); await ready;
  expect(native.listen).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
});

it("cancelar no meio remove inscrição parcial e a resposta tardia sem avançar nem alertar", async () => {
  let complete!: (value: () => Promise<void>) => void;
  const normal = native.listen.getMockImplementation()!; let calls = 0;
  native.listen.mockImplementation((event: string, callback: Callback) => { calls++; return calls === 2 ? new Promise(resolve => { complete = resolve; }) : normal(event, callback); });
  const signal = controller(); const receive = vi.fn(); const ready = subscribeNativeMediaDrop(receive, signal.signal);
  await flush(); signal.abort(); const lateOff = vi.fn(async () => undefined); complete(lateOff); await ready; await flush();
  expect(handlers[0].off).toHaveBeenCalledOnce(); expect(lateOff).toHaveBeenCalledOnce(); expect(native.listen).toHaveBeenCalledTimes(2); expect(warn).not.toHaveBeenCalled();
  handlers[0].callback({ payload: { paths: ["C:/Video.mp4"], position: { x: 1, y: 2 } } }); expect(receive).not.toHaveBeenCalled();
});

it("rejeição tardia depois do cancelamento não repete nem produz banner ou warn de inscrição", async () => {
  let reject!: (reason: Error) => void;
  native.listen.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const signal = controller(); const ready = subscribeNativeMediaDrop(vi.fn(), signal.signal); await flush(); signal.abort(); reject(new Error("closed")); await ready;
  expect(native.listen).toHaveBeenCalledOnce(); expect(warn).not.toHaveBeenCalled();
});

it("falhas assíncronas de unlisten são tratadas sem impedir as demais limpezas", async () => {
  const normal = native.listen.getMockImplementation()!;
  native.listen.mockImplementation(async (event: string, callback: Callback) => { await normal(event, callback); return event === "tauri://drag-over" ? vi.fn(async () => { throw new Error("unlisten rejected"); }) : handlers[handlers.length - 1].off; });
  const signal = controller(); await subscribeNativeMediaDrop(vi.fn(), signal.signal); signal.abort(); await flush();
  expect(warn).toHaveBeenCalledWith("[CutNicePro:native-media-drop:unlisten]", expect.objectContaining({ message: "unlisten rejected" }));
  expect(handlers.filter(item => item.event !== "tauri://drag-over").every(item => item.off.mock.calls.length === 1)).toBe(true);
});
