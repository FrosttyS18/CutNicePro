import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { loadClipLibrary } from "../services/clip-library";
import { loadClipMedia, type ClipMedia } from "../services/clip-media";
import { useClipLibrary } from "../hooks/useClipLibrary";
import { useClipMedia } from "../hooks/useClipMedia";
import { useTimelinePreview } from "../hooks/useTimelinePreview";
import type { ProjectMeta } from "../lib/types";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../services/clip-library", () => ({ loadClipLibrary: vi.fn() }));
vi.mock("../services/clip-media", () => ({ loadClipMedia: vi.fn() }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => {
  await mounted?.close(); mounted = undefined;
  vi.resetAllMocks(); vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function Library({ projects }: { projects: ProjectMeta[] }) {
  const state = useClipLibrary(projects);
  return <div><output>{JSON.stringify(state)}</output><button onClick={state.reload}>Recarregar</button></div>;
}
function Media({ id }: { id: string }) {
  return <output>{JSON.stringify(useClipMedia("p", id))}</output>;
}
function Timeline({ id }: { id?: string }) {
  return <output>{JSON.stringify(useTimelinePreview(id))}</output>;
}
function read() {
  return JSON.parse(mounted!.host.querySelector("output")!.textContent!);
}
const projects: ProjectMeta[] = [{ id: "p", name: "Projeto", created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null }];
const media: ClipMedia = {
  media: { kind: "local", mediaId: "new", name: "new.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 30 },
  url: "blob:new", transcript: [],
};

describe("carregamento vinculado ao projeto e à mídia atuais", () => {
  it("recarrega a biblioteca removendo erro parcial e ignorando resposta substituída", async () => {
    const first = deferred<Awaited<ReturnType<typeof loadClipLibrary>>>();
    const second = deferred<Awaited<ReturnType<typeof loadClipLibrary>>>();
    vi.mocked(loadClipLibrary).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mounted = await reactHost(<Library projects={projects} />);
    expect(read().loading).toBe(true);
    await mounted.click("Recarregar");
    await act(async () => { first.resolve({ entries: [], failed: projects }); });
    expect(read()).toMatchObject({ loading: true, partial: null });
    await act(async () => { second.resolve({ entries: [], failed: projects }); });
    expect(read().partial).toContain("(1)");
    vi.mocked(loadClipLibrary).mockResolvedValueOnce({ entries: [], failed: [] });
    await mounted.click("Recarregar");
    expect(read()).toMatchObject({ loading: false, partial: null, error: null });
  });

  it("não exibe a mídia antiga e permite recuperar depois de erro na troca de clipe", async () => {
    const first = deferred<ClipMedia>();
    const second = deferred<ClipMedia>();
    vi.mocked(loadClipMedia).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mounted = await reactHost(<Media id="old" />);
    await mounted.render(<Media id="new" />);
    await act(async () => { first.resolve({ ...media, url: "blob:old" }); });
    expect(read()).toMatchObject({ source: null, loading: true, error: null });
    await act(async () => { second.reject(new Error("indisponível")); });
    expect(read().error).toContain("Não foi possível");
    const retry = deferred<ClipMedia>();
    vi.mocked(loadClipMedia).mockReturnValueOnce(retry.promise);
    await mounted.render(<Media id="third" />);
    expect(read()).toMatchObject({ source: null, loading: true, error: null });
    await act(async () => { retry.resolve(media); });
    expect(read().source.url).toBe("blob:new");
  });

  it("limpa erros e revoga miniaturas sem reutilizar URLs da mídia anterior", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:frame-one").mockReturnValueOnce("blob:frame-two");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("preview failed"));
    mounted = await reactHost(<Timeline id="bad" />);
    expect(read().error).toContain("Não foi possível");
    const next = deferred<{ version: number; frames: number[][]; peaks: number[]; hasAudio: boolean }>();
    vi.mocked(invoke).mockReturnValueOnce(next.promise);
    await mounted.render(<Timeline id="good" />);
    expect(read()).toMatchObject({ frames: [], loading: true, error: null });
    await act(async () => { next.resolve({ version: 2, frames: [[255, 216]], peaks: [0.5], hasAudio: true }); });
    expect(read().frames).toEqual(["blob:frame-one"]);
    await mounted.render(<Timeline />);
    expect(read()).toMatchObject({ frames: [], loading: false, error: null });
    expect(revoke).toHaveBeenCalledWith("blob:frame-one");
    const again = deferred<{ version: number; frames: number[][]; peaks: number[]; hasAudio: boolean }>();
    vi.mocked(invoke).mockReturnValueOnce(again.promise);
    await mounted.render(<Timeline id="good" />);
    expect(read().frames).toEqual([]);
    await act(async () => { again.resolve({ version: 2, frames: [[255, 216]], peaks: [], hasAudio: false }); });
    expect(read().frames).toEqual(["blob:frame-two"]);
  });
});

