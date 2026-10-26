import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RelinkMediaControl } from "../components/workspace/RelinkMediaControl";
import { CompositionMediaLibrary } from "../components/editor/CompositionMediaLibrary";
import { subscribeMediaRelinked } from "../services/media-relink-events";
import { reactHost } from "./react-host";

const native = vi.hoisted(() => ({ open: vi.fn(), relink: vi.fn(), get: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: native.open }));
vi.mock("../lib/ipc", () => ({ relinkMedia: native.relink, getMedia: native.get }));
vi.mock("../components/editor/CompositionMediaPoster", () => ({ CompositionMediaPoster: () => null }));
const reference = { mediaId: "media", sha256: "a".repeat(64), sizeBytes: 100, ext: "mp4", originalName: "Entrevista.mp4", createdAtMs: 1, projectIds: ["project"], analysis: null, unavailable: false, storageKind: "reference" as const, availability: "available" as const };
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
let off: (() => void) | undefined;
afterEach(async () => { await view?.close(); view = undefined; off?.(); off = undefined; vi.clearAllMocks(); });
beforeEach(() => { native.get.mockResolvedValue(reference); });

it.each(["available", "inaccessible", "changed"] as const)("não oferece localizar original gerenciado %s", async availability => {
  native.get.mockResolvedValue({ ...reference, storageKind: "managed", availability, unavailable: availability!=="available" });
  view = await reactHost(<RelinkMediaControl projectId="project" mediaId="media" kind="video"/>);
  expect(view.host.querySelector('button[aria-label="Localizar arquivo original"]')).toBeNull();
  expect(native.get).toHaveBeenCalledTimes(1);
  expect(native.open).not.toHaveBeenCalled();
});

it("usa o estado conhecido sem nova consulta e permite recuperar gerenciado ausente", async () => {
  view = await reactHost(<RelinkMediaControl projectId="project" mediaId="media" kind="video" knownEntry={{ ...reference, storageKind: "managed", unavailable: true, availability: "missing" }}/>);
  expect(view.host.querySelector('button[aria-label="Localizar arquivo original"]')).not.toBeNull();
  expect(native.get).not.toHaveBeenCalled();
});

it("ignora verificação antiga quando muda a mídia selecionada", async () => {
  let finish!: (value: unknown) => void;
  native.get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ ...reference, mediaId: "second", storageKind: "managed" });
  view = await reactHost(<RelinkMediaControl projectId="project" mediaId="media" kind="video"/>);
  await view.render(<RelinkMediaControl projectId="project" mediaId="second" kind="video"/>);
  await act(async () => { finish(reference); });
  expect(view.host.querySelector('button[aria-label="Localizar arquivo original"]')).toBeNull();
  expect(native.get.mock.calls.map(([id]) => id)).toEqual(["media", "second"]);
});

it("reutiliza a resolução das mídias e não consulta novamente cada cartão da biblioteca", async () => {
  const assets = Array.from({ length:8 }, (_,index) => ({ id:`asset-${index}`,mediaId:`media-${index}`,name:`Vídeo ${index}`,kind:"video" as const,durationUs:1_000_000,width:640,height:360,transcript:[] }));
  const media = Object.fromEntries(assets.map(asset => [asset.id,{url:"source.mp4",error:null,entry:{...reference,mediaId:asset.mediaId,storageKind:"managed" as const}}]));
  view = await reactHost(<CompositionMediaLibrary projectId="project" assets={assets} selectedId="asset-0" previews={{}} media={media} onSelect={vi.fn()} onOpen={vi.fn()} onInsert={vi.fn()}/>);
  expect(view.host.querySelector('button[aria-label="Localizar arquivo original"]')).toBeNull();
  expect(native.get).not.toHaveBeenCalled();
});

it("cancelar a escolha não modifica a mídia nem emite reconexão", async () => {
  const listener = vi.fn(); off = subscribeMediaRelinked(listener);
  native.open.mockResolvedValue(null);
  view = await reactHost(<RelinkMediaControl projectId="project" mediaId="media" kind="video"/>);
  await view.click("Localizar arquivo original");
  expect(native.relink).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
});

it("reconecta somente após confirmação nativa e mantém o ID da mídia", async () => {
  const listener = vi.fn(); off = subscribeMediaRelinked(listener);
  native.open.mockResolvedValue("C:/Vídeos/Entrevista.mp4");
  native.relink.mockResolvedValue({ mediaId: "media", projectIds: ["project"], unavailable: false });
  view = await reactHost(<RelinkMediaControl projectId="project" mediaId="media" kind="video"/>);
  await view.click("Localizar arquivo original");
  expect(native.relink).toHaveBeenCalledWith("project", "media", "C:/Vídeos/Entrevista.mp4", expect.any(Function), expect.any(AbortSignal));
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith("media");
  expect(view.host.querySelector('[role="status"]')?.textContent).toContain("reconectado");
});

it("arquivo diferente mantém o erro visível sem notificar sucesso", async () => {
  const listener = vi.fn(); off = subscribeMediaRelinked(listener);
  native.open.mockResolvedValue("C:/Vídeos/Outro.mp4");
  native.relink.mockRejectedValue(new Error("Este arquivo não corresponde ao original."));
  view = await reactHost(<RelinkMediaControl projectId="project" mediaId="media" kind="video"/>);
  await view.click("Localizar arquivo original");
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("não corresponde");
  expect(listener).not.toHaveBeenCalled();
});

it("desmontar cancela a verificação e ignora uma resposta tardia", async () => {
  const listener = vi.fn(); off = subscribeMediaRelinked(listener);
  native.open.mockResolvedValue("C:/Vídeos/Entrevista.mp4");
  let finish!: (value: unknown) => void;
  native.relink.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  view = await reactHost(<RelinkMediaControl projectId="project" mediaId="media" kind="video"/>);
  await view.click("Localizar arquivo original");
  const signal: AbortSignal = native.relink.mock.calls[0][4];
  await view.close(); view = undefined;
  expect(signal.aborted).toBe(true);
  await act(async () => { finish({ mediaId: "media", unavailable: false }); });
  expect(listener).not.toHaveBeenCalled();
});
it("apresenta reconexão confirmada quando cancelar chegou após sua gravação", async () => {
  const listener = vi.fn(); off = subscribeMediaRelinked(listener);
  native.open.mockResolvedValue("C:/Vídeos/Entrevista.mp4");
  let finish!: (value: unknown) => void;
  native.relink.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  view = await reactHost(<RelinkMediaControl projectId="project" mediaId="media" kind="video"/>);
  await view.click("Localizar arquivo original");
  await view.click("Cancelar verificação do original");
  await act(async () => { finish({ mediaId: "media", unavailable: false }); });
  expect(listener).toHaveBeenCalledWith("media");
  expect(view.host.querySelector('[role="status"]')?.textContent).toContain("reconectado");
});
