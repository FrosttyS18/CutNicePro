import { act, useLayoutEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceData } from "../hooks/useWorkspaceData";
import { emptyWorkspace } from "../lib/workspace";
import { attachPersistedMedia, releaseSessionMedia } from "../services/workspace-store";
import { notifyMediaRelinked } from "../services/media-relink-events";
import { reactHost } from "./react-host";

const native = vi.hoisted(() => ({ get: vi.fn(), url: vi.fn(() => "http://cnplocal.localhost/media/source.mp4") }));
vi.mock("../lib/ipc", () => ({ getMedia: native.get, mediaUrl: native.url }));
const entry = { mediaId: "source", sha256: "a".repeat(64), ext: "mp4", originalName: "Entrevista.mp4", unavailable: false, storageKind: "reference", availability: "available" };
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
let snapshot: ReturnType<typeof useWorkspaceData> | undefined;
afterEach(async () => { await view?.close(); view = undefined; releaseSessionMedia(); vi.clearAllMocks(); });
function Probe() { const current = useWorkspaceData("project"); useLayoutEffect(() => { snapshot = current; }, [current]); return null; }
async function mount() {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Entrevista.mp4", url: null, videoId: null, duration: 10, width: 640, height: 360 };
  view = await reactHost(<Probe/>, environment => { environment.localStorage.setItem("cnp.workspace.v1.project", JSON.stringify(data)); });
}

it("revalida uma referência mesmo quando a sessão já possui a URL", async () => {
  attachPersistedMedia("project", "source", "http://old-source.mp4");
  native.get.mockResolvedValue({ ...entry, unavailable: true, availability: "missing" });
  await mount();
  expect(native.get).toHaveBeenCalledWith("source");
  expect(snapshot?.localUrl).toBeNull();
  expect(snapshot?.mediaEntry?.availability).toBe("missing");
});

it("distingue arquivo alterado de ausente e não oferece relink para gerenciado inacessível", async () => {
  native.get.mockResolvedValue({ ...entry, unavailable: true, availability: "changed" });
  await mount();
  expect(snapshot?.notice?.text).toContain("alterado");
  expect(snapshot?.canRelink).toBe(true);
  await view!.close(); view=undefined;
  native.get.mockResolvedValue({ ...entry, storageKind: "managed", unavailable: true, availability: "inaccessible" });
  await mount();
  expect(snapshot?.notice?.text).toContain("acessar");
  expect(snapshot?.canRelink).toBe(false);
});

it("reconexão atualiza a fonte preservando o rascunho e a versão salva", async () => {
  native.get.mockResolvedValue(entry);
  await mount();
  const saved = localStorage.getItem("cnp.workspace.v1.project");
  await act(async () => { snapshot!.change({ ...snapshot!.data, settings: { ...snapshot!.data.settings, zoom: 1.7 } }); });
  expect(snapshot?.dirty).toBe(true);
  await act(async () => { notifyMediaRelinked("source"); });
  expect(snapshot?.localUrl).toContain("?relink=1");
  expect(snapshot?.data.settings.zoom).toBe(1.7);
  expect(snapshot?.dirty).toBe(true);
  expect(localStorage.getItem("cnp.workspace.v1.project")).toBe(saved);
});
