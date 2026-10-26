import { act, StrictMode, useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCompositionMedia } from "../hooks/useCompositionMedia";
import type { CompositionAsset } from "../lib/composition-types";
import type { MediaEntryDto } from "../lib/ipc";
import { notifyMediaRelinked } from "../services/media-relink-events";
import { reactHost } from "./react-host";

vi.mock("../lib/ipc", () => ({ getMedia: vi.fn(), mediaUrl: vi.fn((entry: MediaEntryDto) => `http://cnplocal.localhost/${entry.mediaId}.mp4`) }));
const ipc = await import("../lib/ipc");
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
let entries: ReturnType<typeof useCompositionMedia> = {};
const renders: ReturnType<typeof useCompositionMedia>[] = [];
beforeEach(() => { vi.resetAllMocks(); vi.mocked(ipc.mediaUrl).mockImplementation(entry => `http://cnplocal.localhost/${entry.mediaId}.mp4`); });
afterEach(async () => { await view?.close(); view = undefined; entries = {}; renders.length = 0; });

function asset(id: string, mediaId = id): CompositionAsset {
  return { id, mediaId, name: `${mediaId}.mp4`, kind: "video", durationUs: 10_000_000, width: 1920, height: 1080, transcript: [] };
}
function media(mediaId: string): MediaEntryDto {
  return { mediaId, sha256: "a".repeat(64), sizeBytes: 10, ext: "mp4", originalName: `${mediaId}.mp4`, createdAtMs: 1, projectIds: ["p"], analysis: null, unavailable: false };
}
function deferred() {
  let resolve!: (value: MediaEntryDto | null) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<MediaEntryDto | null>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function Probe({ assets, sourceId, sourceUrl }: { assets: CompositionAsset[]; sourceId?: string; sourceUrl?: string }) {
  const current = useCompositionMedia(assets, sourceId, sourceUrl);
  useLayoutEffect(() => { entries = current; renders.push(current); }, [current]);
  return null;
}

it("publica sourceUrl e mídia rápida enquanto outra continua pendente em StrictMode", async () => {
  const fast = deferred(), slow = deferred();
  vi.mocked(ipc.getMedia).mockImplementation(id => id === "fast" ? fast.promise : slow.promise);
  const assets = [asset("source"), asset("fast"), asset("slow")];
  const before = structuredClone(assets);
  assets.forEach(value => Object.freeze(value));
  view = await reactHost(<StrictMode><Probe assets={assets} sourceId="source" sourceUrl="blob:session"/></StrictMode>);
  expect(entries.source).toEqual({ url: "blob:session", error: null });
  expect(entries.slow).toBeUndefined();
  await act(async () => fast.resolve(media("fast")));
  expect(entries.fast.url).toContain("/fast.mp4");
  expect(entries.slow).toBeUndefined();
  expect(ipc.getMedia).toHaveBeenCalledTimes(2);
  expect(assets).toEqual(before);
});

it("publica erro e fonte alterada isoladamente sem reter a mídia disponível", async () => {
  const ready = deferred(), failed = deferred(), changed = deferred(), slow = deferred();
  const pending = { ready, failed, changed, slow };
  vi.mocked(ipc.getMedia).mockImplementation(id => pending[id as keyof typeof pending].promise);
  view = await reactHost(<Probe assets={Object.keys(pending).map(id => asset(id))}/>);
  await act(async () => ready.resolve(media("ready")));
  expect(entries.ready?.url).toContain("/ready.mp4");
  await act(async () => failed.reject(new Error("Acesso negado")));
  expect(entries.failed).toEqual({ url: null, error: "Acesso negado", entry: null });
  await act(async () => changed.resolve({ ...media("changed"), unavailable: true, availability: "changed" }));
  expect(entries.changed.url).toBeNull();
  expect(entries.changed.error).toContain("foi alterado");
  expect(entries.ready?.url).toContain("/ready.mp4");
  expect(entries.slow).toBeUndefined();
});

it("adicionar assets conserva resoluções prontas e pendentes e compartilha a mesma mídia", async () => {
  const ready = deferred(), slow = deferred(), added = deferred();
  vi.mocked(ipc.getMedia).mockImplementation(id => id === "ready" ? ready.promise : id === "slow" ? slow.promise : added.promise);
  const assets = [asset("ready"), asset("slow")];
  view = await reactHost(<Probe assets={assets}/>);
  await act(async () => ready.resolve(media("ready")));
  expect(entries.ready.url).toContain("/ready.mp4");
  await view.render(<Probe assets={[...assets.map(value => ({ ...value })), asset("copy", "ready"), asset("added")]}/>);
  expect(entries.ready.url).toContain("/ready.mp4");
  expect(entries.copy.url).toBe(entries.ready.url);
  expect(entries.slow).toBeUndefined();
  expect(ipc.getMedia).toHaveBeenCalledTimes(3);
  await act(async () => slow.resolve(media("slow")));
  expect(entries.slow.url).toContain("/slow.mp4");
  expect(entries.added).toBeUndefined();
});

it("trocar mediaId no mesmo assetId invalida imediatamente a URL resolvida", async () => {
  const next = deferred();
  vi.mocked(ipc.getMedia).mockResolvedValueOnce(media("old")).mockReturnValueOnce(next.promise);
  view = await reactHost(<Probe assets={[asset("slot", "old")]}/>);
  expect(entries.slot.url).toContain("/old.mp4");
  const firstNewRender = renders.length;
  await view.render(<Probe assets={[asset("slot", "new")]}/>);
  expect(entries.slot).toBeUndefined();
  expect(renders.slice(firstNewRender).every(value => !value.slot)).toBe(true);
  await act(async () => next.resolve({ ...media("new"), unavailable: true }));
  expect(entries.slot.url).toBeNull();
  expect(entries.slot.error).toContain("new.mp4");
});

it("relink descarta URL de sessão e resposta velha sem recarregar a outra mídia", async () => {
  const first = deferred(), latest = deferred();
  let reload = 0;
  vi.mocked(ipc.getMedia).mockImplementation(id => id === "other" ? Promise.resolve(media(id)) : (++reload === 1 ? first.promise : latest.promise));
  const assets = [asset("source"), asset("other")];
  const render = () => <Probe assets={assets} sourceId="source" sourceUrl="http://old-session.mp4"/>;
  view = await reactHost(render());
  expect(entries.source.url).toBe("http://old-session.mp4");
  await act(async () => notifyMediaRelinked("source"));
  expect(entries.source).toBeUndefined();
  expect(entries.other.url).toContain("/other.mp4");
  await act(async () => notifyMediaRelinked("source"));
  await act(async () => first.resolve(media("source")));
  expect(entries.source).toBeUndefined();
  await act(async () => latest.resolve(media("source")));
  expect(entries.source.url).toBe("http://cnplocal.localhost/source.mp4?relink=2");
  expect(vi.mocked(ipc.getMedia).mock.calls.filter(([id]) => id === "other")).toHaveLength(1);
});

it("remover mídia invalida a entrada pronta e impede promessa antiga de reaparecer", async () => {
  const old = deferred(), pending = deferred(), retry = deferred();
  let removedRequests = 0;
  vi.mocked(ipc.getMedia).mockImplementation(id => id === "ready" ? Promise.resolve(media(id)) : id === "pending" ? pending.promise : ++removedRequests === 1 ? old.promise : retry.promise);
  view = await reactHost(<Probe assets={[asset("ready"), asset("removed"), asset("pending")]}/>);
  await view.render(<Probe assets={[asset("pending")]}/>);
  expect(entries.ready).toBeUndefined();
  await act(async () => old.resolve(media("removed")));
  expect(entries.removed).toBeUndefined();
  await view.render(<Probe assets={[asset("removed")]}/>);
  expect(entries.removed).toBeUndefined();
  await act(async () => retry.resolve(media("removed")));
  expect(entries.removed.url).toContain("/removed.mp4");
  expect(ipc.getMedia).toHaveBeenCalledTimes(4);
});

it("não publica resolução após unmount nem reaproveita sua resposta na próxima montagem", async () => {
  const old = deferred(), fresh = deferred();
  vi.mocked(ipc.getMedia).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  view = await reactHost(<Probe assets={[asset("source")]}/>);
  await view.close(); view = undefined;
  const count = renders.length;
  await act(async () => old.resolve(media("source")));
  expect(renders).toHaveLength(count);
  await act(async () => notifyMediaRelinked("source"));
  expect(ipc.getMedia).toHaveBeenCalledTimes(1);
  view = await reactHost(<Probe assets={[asset("source")]}/>);
  expect(entries.source).toBeUndefined();
  await act(async () => fresh.resolve(media("source")));
  expect(entries.source.url).toContain("/source.mp4");
  expect(ipc.getMedia).toHaveBeenCalledTimes(2);
});
