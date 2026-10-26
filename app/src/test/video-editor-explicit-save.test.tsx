import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoEditor } from "../components/editor/VideoEditor";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("../components/editor/EditorTimeline", () => ({ EditorTimeline: () => null }));
vi.mock("../components/editor/EditorInspector", () => ({ EditorInspector: () => null, panelForTool: () => "captions" }));
vi.mock("../components/workspace/TranscriptPanel", () => ({ TranscriptPanel: () => null }));
vi.mock("../components/workspace/VideoPreview", () => ({ VideoPreview: () => null }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.useRealTimers(); });

describe("salvamento visível e explícito do editor", () => {
  it("não salva a edição sozinho após um arrasto", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const save = vi.fn(async () => true);
    mounted = await reactHost(<VideoEditor title="Projeto" data={emptyWorkspace()} localUrl={null} dirty onChange={() => undefined} onSave={save} onBack={() => undefined} />, environment => {
      environment.setTimeout = globalThis.setTimeout as unknown as typeof environment.setTimeout;
      environment.clearTimeout = globalThis.clearTimeout as unknown as typeof environment.clearTimeout;
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(save).not.toHaveBeenCalled();
    expect(mounted.host.querySelector('[data-testid="editor-save-status"]')?.textContent).toContain("não salvas");
  });
  it("apresenta Salvar com texto e executa a gravação pelo clique", async () => {
    const save = vi.fn(async () => true);
    mounted = await reactHost(<VideoEditor title="Projeto" data={emptyWorkspace()} localUrl={null} dirty onChange={() => undefined} onSave={save} onBack={() => undefined} />);
    await mounted.click("Salvar");
    expect(save).toHaveBeenCalledOnce();
  });
});
