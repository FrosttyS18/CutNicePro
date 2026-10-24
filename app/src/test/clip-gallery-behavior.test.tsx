import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipGallery } from "../components/clips/ClipGallery";
import type { LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../components/clips/ClipPoster", () => ({ ClipPoster: () => <span>Miniatura</span> }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function entry(project: string, id: string, createdAtMs?: number): LibraryClip {
  return { project: { id: project, name: project, created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null }, mediaId: "m",
    clip: { id: id.repeat(64), start: 0, end: 30, title: `Trecho ${id}`, review: "pending", score: 80, reasons: [], createdAtMs } };
}

describe("organização e atualização da biblioteca", () => {
  it("separa projetos em seções, sem misturar os cards ou perder ações", async () => {
    const entries = [entry("Beta", "b"), entry("Alfa", "a"), entry("Beta", "c")];
    const onInspect = vi.fn();
    const view = await reactHost(<ClipGallery entries={entries} showProject onInspect={onInspect} onDownload={() => {}} />);
    const groups = [...view.host.querySelectorAll<HTMLElement>(".clip-project-group")];
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector("h3")?.textContent).toBe("Alfa");
    expect(groups[1].querySelector("h3")?.textContent).toBe("Beta");
    expect(groups[0].querySelectorAll(".clip-card")).toHaveLength(1);
    expect(groups[1].querySelectorAll(".clip-card")).toHaveLength(2);
    await view.click("Trecho a");
    expect(onInspect).toHaveBeenCalledWith(entries[1]);
    expect(view.host.querySelectorAll(".clip-card__actions button")).toHaveLength(3);
    await view.close();
  });
  it("mantém Novo ao abrir e expira com a tela ociosa, atualizando o tempo", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    const inspect = vi.fn();
    const view = await reactHost(<ClipGallery entries={[entry("Alfa", "a", now - 3_599_000)]} onInspect={inspect} />);
    expect(view.host.querySelectorAll(".clip-card__new")).toHaveLength(1);
    const open = view.host.querySelector<HTMLButtonElement>(".clip-card__open")!;
    await act(async () => open.click());
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(view.host.querySelectorAll(".clip-card__new")).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(view.host.querySelectorAll(".clip-card__new")).toHaveLength(0);
    expect(view.host.querySelector(".clip-card__when")?.textContent).toBe("há 1 hora");
    await view.close();
  });
});
