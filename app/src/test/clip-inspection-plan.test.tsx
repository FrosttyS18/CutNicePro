import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ClipInspection } from "../components/clips/ClipInspection";
import type { VideoPreview } from "../components/workspace/VideoPreview";
import type { LibraryClip } from "../lib/clip-library";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));
vi.mock("../hooks/useClipMedia", () => ({ useClipMedia: () => ({ loading: false, error: null,
  source: { url: "blob:test", media: { width: 1920, height: 1080, duration: 100 }, transcript: [] },
}) }));
vi.mock("../components/workspace/VideoPreview", () => ({ VideoPreview: ({ videoRef, onTime }: ComponentProps<typeof VideoPreview>) =>
  <><video ref={videoRef}/><button type="button" onClick={() => onTime?.(35)}>Simular vão</button></>,
}));

let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); });

it("a inspeção pula o trecho removido e mostra a duração efetiva da edição salva", async () => {
  const entry: LibraryClip = { project: { id: "inspection-flow", name: "Projeto", created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null }, mediaId: "m",
    clip: { id: "c".repeat(64), start: 10, end: 30, title: "História", score: 80, reasons: [], review: "pending" } };
  const data = emptyWorkspace();
  data.clipEdits = { [entry.clip.id]: { ...data.settings, trimStart: 10, trimEnd: 50,
    editPlan: { version: 1, segments: [{ sourceStart: 10, sourceEnd: 30 }, { sourceStart: 40, sourceEnd: 50 }] } } };
  view = await reactHost(<ClipInspection entry={entry} onClose={() => {}} onEdit={() => {}}/>, environment => {
    environment.localStorage.setItem("cnp.workspace.v1.inspection-flow", JSON.stringify(data));
  });
  await view.click("Simular vão");
  expect(view.host.querySelector("video")!.currentTime).toBe(40);
  expect(view.host.querySelector('output[aria-label="Tempo de reprodução"]')?.textContent).toContain("00:20.00");
  expect(view.host.querySelector<HTMLInputElement>("#clip-inspection-seek")?.max).toBe("30");
});
