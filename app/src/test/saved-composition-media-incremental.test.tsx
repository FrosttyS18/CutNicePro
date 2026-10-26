import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SavedCompositionPreview } from "../components/clips/SavedCompositionPreview";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { MediaEntryDto } from "../lib/ipc";
import { reactHost } from "./react-host";

vi.mock("../lib/ipc", () => ({ getMedia: vi.fn(), mediaUrl: vi.fn((entry: MediaEntryDto) => `http://cnplocal.localhost/${entry.mediaId}.mp4`) }));
vi.mock("../components/editor/CompositionStage", () => ({
  CompositionStage: ({ media }: { media: Record<string, { url: string | null }> }) => <div>{Object.entries(media).map(([id, entry]) => <output key={id} aria-label={`URL de ${id}`}>{entry.url}</output>)}</div>,
}));
const ipc = await import("../lib/ipc");
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); });

it("a prévia salva entrega a mídia resolvida ao Stage mesmo com asset alheia pendente", async () => {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "fast", name: "Fonte.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  const document = compositionFromLegacy(workspace);
  document.assets.push({ ...document.assets[0], id: "slow", mediaId: "slow" });
  let resolve!: (value: MediaEntryDto) => void;
  const fast = new Promise<MediaEntryDto>(done => { resolve = done; });
  const slow = new Promise<MediaEntryDto>(() => {});
  vi.mocked(ipc.getMedia).mockImplementation(id => id === "fast" ? fast : slow);
  const playback = { frame: 0, playing: false, buffering: false, toggle: vi.fn(), seek: vi.fn(), pause: vi.fn() };
  view = await reactHost(<SavedCompositionPreview document={document} playback={playback}/>);
  expect(view.host.querySelector('[aria-label="URL de fast"]')).toBeNull();
  await act(async () => resolve({ mediaId: "fast", sha256: "a".repeat(64), sizeBytes: 10, ext: "mp4", originalName: "Fonte.mp4", createdAtMs: 1, projectIds: ["p"], analysis: null, unavailable: false }));
  expect(view.host.querySelector('[aria-label="URL de fast"]')?.textContent).toBe("http://cnplocal.localhost/fast.mp4");
  expect(view.host.querySelector('[aria-label="URL de slow"]')).toBeNull();
  expect(ipc.getMedia).toHaveBeenCalledTimes(2);
});
