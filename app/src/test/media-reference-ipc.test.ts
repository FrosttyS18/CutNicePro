import { afterEach, expect, it, vi } from "vitest";
import * as ipc from "../lib/ipc";

const native = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), off: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: native.listen }));

const entry = {
  mediaId: "e75288c0-fbe3-4fb7-b4a0-2a214f1f639a", sha256: "a".repeat(64), sizeBytes: 120,
  ext: "mp4", originalName: "Entrevista.mp4", createdAtMs: 1, projectIds: ["p"], analysis: null,
  unavailable: false, storageKind: "reference", availability: "available",
};
afterEach(() => vi.resetAllMocks());

it("preserva localização tipada e disponibilidade sem expor caminhos no resultado da importação", async () => {
  native.listen.mockResolvedValue(native.off);
  native.invoke.mockResolvedValue(JSON.stringify({ ...entry, storage: { kind: "reference", path: "C:/privado/video.mp4" } }));
  const imported = await ipc.importMedia("p", "C:/origem.mp4", vi.fn());
  expect(imported.entry).toMatchObject({ storageKind: "reference", availability: "available" });
  expect(imported.entry).not.toHaveProperty("storage");
  expect(native.off).toHaveBeenCalledOnce();
});

it("resolve URLs pelo registro da mídia e preserva a rota legada para entradas sem ID", () => {
  expect(ipc.mediaUrl(entry)).toBe(`http://cnplocal.localhost/media/${entry.mediaId}.mp4`);
  expect(ipc.mediaUrl({ sha256: entry.sha256, ext: "mp4" })).toBe(`http://cnplocal.localhost/${entry.sha256}.mp4`);
});

it("recusa disponibilidade desconhecida em vez de aceitar uma fonte como válida", async () => {
  native.invoke.mockResolvedValue({ ...entry, availability: "qualquer" });
  await expect(ipc.getMedia(entry.mediaId)).rejects.toThrow("Resposta de mídia inválida");
});
it("não aceita arrays como estado de disponibilidade", async () => {
  native.invoke.mockResolvedValue({ ...entry, availability: ["available"] });
  await expect(ipc.getMedia(entry.mediaId)).rejects.toThrow("Resposta de mídia inválida");
});

it("reconexão usa seu próprio job e valida identidade e vínculo na resposta", async () => {
  native.listen.mockResolvedValue(native.off);
  native.invoke.mockResolvedValue(entry);
  await expect(ipc.relinkMedia("p", entry.mediaId, "C:/Vídeos/Original.mp4", vi.fn())).resolves.toMatchObject({ mediaId: entry.mediaId });
  expect(native.invoke).toHaveBeenCalledWith("relink_media", { projectId: "p", mediaId: entry.mediaId, srcPath: "C:/Vídeos/Original.mp4", jobId: expect.any(String) });
  native.invoke.mockResolvedValue({ ...entry, mediaId: "different" });
  await expect(ipc.relinkMedia("p", entry.mediaId, "C:/Vídeos/Outro.mp4", vi.fn())).rejects.toThrow("confirmar o arquivo original");
  expect(native.off).toHaveBeenCalledTimes(2);
});

it("informa bytes verificados e a fase real sem tratar a leitura como cópia", async () => {
  let progress: ((event: { payload: unknown }) => void) | undefined;
  native.listen.mockImplementation(async (_name, listener) => { progress = listener; return native.off; });
  native.invoke.mockImplementation(async (_name, args) => {
    progress?.({ payload: { jobId: args.jobId, bytesCopied: 0, bytesProcessed: 60, totalBytes: 120, phase: "hashing" } });
    return entry;
  });
  const callback = vi.fn();
  await ipc.relinkMedia("p", entry.mediaId, "C:/Vídeos/Original.mp4", callback);
  expect(callback).toHaveBeenCalledWith(60, 120, "hashing");
});
it.each([true,false])("honra commit confirmado após pedido de cancelar com confirmação %s", async cancellationAccepted => {
  native.listen.mockResolvedValue(native.off);
  let finish!: (value: unknown) => void;
  native.invoke.mockImplementation(command => command === "relink_media" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(cancellationAccepted));
  const controller = new AbortController();
  const relinking = ipc.relinkMedia("p", entry.mediaId, "C:/Vídeos/Original.mp4", vi.fn(), controller.signal);
  await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith("relink_media", expect.any(Object)));
  controller.abort();
  finish(entry);
  await expect(relinking).resolves.toMatchObject({ mediaId: entry.mediaId });
  expect(native.off).toHaveBeenCalledOnce();
});

it.each([true,false])("erro nativo após cancelar termina em AbortError com confirmação %s", async cancellationAccepted => {
  native.listen.mockResolvedValue(native.off);
  let fail!:(error:Error)=>void;
  native.invoke.mockImplementation(command=>command==="relink_media"?new Promise((_resolve,reject)=>{fail=reject;}):Promise.resolve(cancellationAccepted));
  const controller=new AbortController();
  const relinking=ipc.relinkMedia("p",entry.mediaId,"C:/Vídeos/Original.mp4",vi.fn(),controller.signal);
  await vi.waitFor(()=>expect(native.invoke).toHaveBeenCalledWith("relink_media",expect.any(Object)));
  controller.abort();
  fail(new Error("Verificação cancelada"));
  await expect(relinking).rejects.toMatchObject({name:"AbortError"});
  expect(native.off).toHaveBeenCalledOnce();
});

it("preserva ausência e entrada gerenciada antiga sem inventar uma referência", async () => {
  native.invoke.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...entry, storageKind: undefined, availability: undefined });
  await expect(ipc.getMedia("missing")).resolves.toBeNull();
  const loaded = await ipc.getMedia(entry.mediaId);
  expect(loaded?.storageKind).toBe("managed");
  expect(loaded?.availability).toBe("available");
});
