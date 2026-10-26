import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ClipDownload } from "../components/clips/ClipDownload";
import { ClipPoster } from "../components/clips/ClipPoster";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";

const native = vi.hoisted(() => ({ thumbnail: vi.fn(), exportDocument: vi.fn(), legacyMedia: vi.fn() }));
vi.mock("../lib/ipc", () => ({ getEditorThumbnail: native.thumbnail }));
vi.mock("../hooks/useClipMedia", () => ({ useClipMedia: () => { native.legacyMedia(); throw new Error("Não deve exigir a fonte legada"); } }));
vi.mock("../hooks/useCompositionExport", () => ({ useCompositionExport: () => ({ exportDocument: native.exportDocument, busy: false, job: null, cancel: vi.fn() }) }));
vi.mock("../hooks/useClips", () => ({ useClips: () => ({}) }));
vi.mock("../services/clip-thumbnails", () => ({ loadClipThumbnail: vi.fn() }));
let observerCallback: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
class Observer {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { observerCallback = callback; }
  observe() {}
  disconnect() {}
}
const workspace = emptyWorkspace();
workspace.media = { kind: "local", name: "Fonte", mediaId: "m", duration: 30, width: 640, height: 360, videoId: null, url: null };
const document = { ...compositionFromLegacy(workspace), revision: 2 };
const entry: LibraryClip = { project: { id: "p", name: "Projeto", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }, mediaId: "m",
  clip: { id: "a".repeat(64), title: "Manual", start: 0, end: 30, score: null, reasons: [], review: "pending", origin: "manual" },
  composition: { document, manuallyEdited: false, editedAtMs: 1, origin: "manual", title: "Manual", createdAtMs: 1 } };
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); vi.restoreAllMocks(); });

it("download de montagem usa documento salvo sem carregar a fonte antiga", async () => {
  native.exportDocument.mockResolvedValue({ status: "completed" });
  const changed = vi.fn();
  mounted = await reactHost(<ClipDownload entry={entry} onClose={() => {}} onChanged={changed} />);
  expect(native.exportDocument).toHaveBeenCalledWith(document, entry.clip.id);
  expect(native.legacyMedia).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledWith("Vídeo exportado.");
});

it("miniatura usa revisão salva e revoga imagem antiga na atualização", async () => {
  native.thumbnail.mockResolvedValue([255, 216, 255, 217]);
  vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:old").mockReturnValueOnce("blob:new");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  mounted = await reactHost(<ClipPoster entry={entry} workspace={workspace} />, () => { vi.stubGlobal("IntersectionObserver", Observer); });
  expect(native.thumbnail).not.toHaveBeenCalled();
  await act(async () => observerCallback?.([{ isIntersecting: true }]));
  expect(native.thumbnail).toHaveBeenCalledWith("p", entry.clip.id, 2);
  expect(mounted.host.querySelector("img")?.getAttribute("src")).toBe("blob:old");
  await mounted.render(<ClipPoster entry={{ ...entry, composition: { ...entry.composition!, document: { ...document, revision: 3 } } }} workspace={workspace} />);
  expect(revoke).toHaveBeenCalledWith("blob:old");
  expect(mounted.host.querySelector("img")).toBeNull();
  await act(async () => observerCallback?.([{ isIntersecting: true }]));
  expect(mounted.host.querySelector("img")?.getAttribute("src")).toBe("blob:new");
  await mounted.close(); mounted = undefined;
  expect(revoke).toHaveBeenCalledWith("blob:new");
});
