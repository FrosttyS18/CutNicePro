import { afterEach, expect, it, vi } from "vitest";
import { getMedia, importMedia, mediaUrl } from "../lib/ipc";
import { nativeMediaFixture } from "./fixtures/native-media-entry";

const native = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), off: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: native.listen }));
afterEach(() => vi.resetAllMocks());

for (const [name, entry] of Object.entries(nativeMediaFixture)) {
  if (typeof entry === "string") continue;
  it(`lê o recibo serde nativo ${name} sem alterar os nomes do contrato`, async () => {
    native.invoke.mockResolvedValue(entry);
    const parsed = await getMedia(entry.mediaId);
    expect(parsed).toEqual(entry);
    expect(parsed).not.toHaveProperty("storage");
    expect(parsed).not.toHaveProperty("path");
    expect(parsed).not.toHaveProperty("stamp");
    expect(mediaUrl(parsed!)).toBe(`http://cnplocal.localhost/media/${entry.mediaId}.${entry.ext}`);
  });
}

it("consome o JSON de importação com o DTO realmente serializado pelo Rust", async () => {
  native.listen.mockResolvedValue(native.off);
  native.invoke.mockResolvedValue(JSON.stringify(nativeMediaFixture.referenceAvailable));
  const imported = await importMedia("p1", "C:/Vídeos/Original.mp4", vi.fn());
  expect(imported.entry).toEqual(nativeMediaFixture.referenceAvailable);
  expect(imported.analysisError).toBeNull();
  expect(native.off).toHaveBeenCalledOnce();
});
