import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useClips } from "../hooks/useClips";
import { compositionFromLegacy } from "../lib/composition-legacy";
import type { EditorProjectState } from "../lib/composition-persistence";
import { emptyWorkspace } from "../lib/workspace";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { prepareClipEditing } from "../services/clip-media";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
const id = "a".repeat(64);
const workspace = emptyWorkspace();
workspace.media = { kind: "local", name: "Fonte", mediaId: "m", duration: 30, width: 640, height: 360, videoId: null, url: null };
const document = compositionFromLegacy(workspace);
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });

it("projeto sem fonte ativa revisa, exclui e restaura manual no mesmo ID", async () => {
  let state: EditorProjectState = { version: 1, project: null, clips: { [id]: { document, manuallyEdited: false, editedAtMs: 1000, origin: "manual", title: "Manual", createdAtMs: 1000 } } };
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "load_editor_project") return state;
    if (command === "update_editor_clip_metadata") {
      const changes = args as { review?: "approved"; deleted?: boolean };
      state = { ...state, clips: { [id]: { ...state.clips[id], ...changes } } };
      return state;
    }
    return null;
  });
  let controller!: ReturnType<typeof useClips>;
  function Probe() { controller = useClips("p"); return null; }
  mounted = await reactHost(<Probe />);
  expect(controller.collection?.clips[0]).toMatchObject({ id, score: null, createdAtMs: 1000 });
  await act(async () => { expect(await controller.review(id, "approved")).toBe(true); });
  expect(controller.collection?.clips[0].review).toBe("approved");
  await act(async () => { expect(await controller.remove(id)).toBe(true); });
  expect(controller.collection?.clips[0].deleted).toBe(true);
  await act(async () => { expect(await controller.restore(id)).toBe(true); });
  expect(controller.collection?.clips[0]).toMatchObject({ id, deleted: false, createdAtMs: 1000 });
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "delete_clip" || command === "review_clip")).toBe(false);
});

it("abre montagem salva sem exigir fonte antiga e preserva seus dados", async () => {
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "load_editor_project") return { version: 1, project: null, clips: { [id]: { document, manuallyEdited: false, editedAtMs: 1000, origin: "manual", title: "Manual", createdAtMs: 1000 } } };
    throw new Error("Não deve carregar a fonte original");
  });
  mounted = await reactHost(<p>Preparação</p>);
  saveWorkspace("p", workspace);
  await prepareClipEditing("p", "ausente", { id, title: "Manual", score: null, start: 0, end: 120, reasons: [], review: "pending", origin: "manual" });
  const saved = readWorkspace("p");
  expect(saved.activeClipId).toBe(id);
  expect(saved.media).toEqual(workspace.media);
  expect(saved.settings).toEqual(workspace.settings);
  expect(invoke).not.toHaveBeenCalledWith("get_media", expect.anything());
});

it("geração explícita preserva manual e conta ambos na biblioteca", async () => {
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "load_editor_project") return { version: 1, project: null, clips: { [id]: { document, manuallyEdited: false, editedAtMs: 1000, origin: "manual", title: "Manual", createdAtMs: 1000 } } };
    if (command === "generate_clips") return { version: 1, mediaId: "m", transcriptHash: "hash", clips: [{ id: "b".repeat(64), title: "IA", score: 80, start: 1, end: 10, reasons: [], review: "pending" }] };
    return null;
  });
  let controller!: ReturnType<typeof useClips>;
  function Probe() { controller = useClips("p", "m"); return null; }
  mounted = await reactHost(<Probe />);
  await act(async () => { await controller.generate({ automatic: false, format: "16:9" }); });
  expect(controller.collection?.clips).toHaveLength(2);
  expect(controller.notice).toContain("2 cortes no total");
  expect(controller.collection?.clips.find(clip => clip.id === id)?.score).toBeNull();
});
