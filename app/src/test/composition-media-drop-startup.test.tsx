import { act, StrictMode, useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCompositionMediaDrop } from "../hooks/useCompositionMediaDrop";
import type { CompositionTimelineDropController } from "../lib/composition-drop-controller";
import { reactHost } from "./react-host";

const native = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ listen: native.listen }) }));
type Callback = (event: { payload: { paths: string[]; position: { x: number; y: number } } }) => void;
let subscriptions: { event: string; callback: Callback; live: boolean }[];
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
const onError = vi.fn(), onPath = vi.fn();
const controller: CompositionTimelineDropController = { contains: () => true, resolve: () => ({ frame: 0, trackId: "main" }), hover: vi.fn(() => null), clear: vi.fn() };
function Probe({ session = "project" }: { session?: string }) {
  const scope = useRef<HTMLElement>(null), timeline = useRef(controller);
  useCompositionMediaDrop({ scope, timeline, sessionKey: session, enabled: true, onAsset: vi.fn(), onPath, onPause: vi.fn(), onError });
  return <section ref={scope}/>;
}
const prepare: NonNullable<Parameters<typeof reactHost>[1]> = environment => { Object.defineProperty(environment, "__TAURI_INTERNALS__", { value: {}, configurable: true }); };
beforeEach(() => {
  vi.clearAllMocks(); subscriptions = []; vi.spyOn(console, "warn").mockImplementation(() => undefined);
  native.listen.mockReset().mockImplementation(async (event: string, callback: Callback) => {
    const subscription = { event, callback, live: true }; subscriptions.push(subscription);
    return vi.fn(async () => { subscription.live = false; });
  });
});
afterEach(async () => { await view?.close(); view = undefined; vi.restoreAllMocks(); });
async function drop() {
  await act(async () => {
    for (const item of subscriptions.filter(subscription => subscription.live && subscription.event === "tauri://drag-drop")) item.callback({ payload: { paths: ["C:/Vídeo.mp4"], position: { x: 10, y: 10 } } });
  });
}

it("falha transitória ao abrir editor tenta uma vez e não exibe banner nem duplica importação", async () => {
  native.listen.mockRejectedValueOnce(new Error("event backend initializing"));
  view = await reactHost(<Probe/>, prepare);
  expect(native.listen).toHaveBeenCalledTimes(5); expect(onError).not.toHaveBeenCalled();
  expect(subscriptions.filter(item => item.live)).toHaveLength(4);
  await drop();
  expect(onPath).toHaveBeenCalledTimes(1); expect(onPath).toHaveBeenCalledWith("C:/Vídeo.mp4", { kind: "drop", target: { frame: 0, trackId: "main" } });
});

it("falha persistente de ativação informa causa de etapa sem alegar falha de importação", async () => {
  native.listen.mockRejectedValue(new Error("event.listen denied"));
  view = await reactHost(<Probe/>, prepare);
  expect(native.listen).toHaveBeenCalledTimes(2); expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith("Não foi possível ativar o arraste de arquivos. Use Importar mídia ou reabra o editor para tentar novamente.");
  expect(onPath).not.toHaveBeenCalled();
});

it("StrictMode mantém somente uma inscrição efetiva", async () => {
  view = await reactHost(<StrictMode><Probe/></StrictMode>, prepare);
  expect(native.listen).toHaveBeenCalledTimes(4); expect(subscriptions.filter(item => item.live)).toHaveLength(4);
  await drop(); expect(onPath).toHaveBeenCalledTimes(1); expect(onError).not.toHaveBeenCalled();
});

it("trocar projeto e desmontar durante inscrição ignora falha tardia sem banner", async () => {
  let reject!: (reason: Error) => void;
  native.listen.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  view = await reactHost(<Probe/>, prepare);
  await view.render(<Probe session="next"/>);
  await act(async () => reject(new Error("closed old webview listener")));
  expect(onError).not.toHaveBeenCalled(); expect(subscriptions.filter(item => item.live)).toHaveLength(4);
  await drop(); expect(onPath).toHaveBeenCalledTimes(1);
  await view.close(); view = undefined;
  expect(subscriptions.filter(item => item.live)).toHaveLength(0);
});
