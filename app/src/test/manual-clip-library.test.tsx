import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { mergeEditorClips, visibleClips } from "../lib/clip-library";
import { ClipGallery } from "../components/clips/ClipGallery";
import type { CompositionSnapshot, EditorProjectState } from "../lib/composition-persistence";
import type { ClipCollection } from "../lib/clips";
import { loadClipLibrary } from "../services/clip-library";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const project = { id: "p", name: "Meu projeto", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null };
const workspace = emptyWorkspace();
workspace.media = { kind: "local", name: "Vídeo", mediaId: "m", width: 640, height: 360, duration: 30, videoId: null, url: null };
const document = compositionFromLegacy(workspace);
const id = "a".repeat(64);
const snapshot: CompositionSnapshot = { document, manuallyEdited: false, editedAtMs: 5000, origin: "manual", title: "Minha montagem", createdAtMs: 1000 };
const state: EditorProjectState = { version: 1, project: null, clips: { [id]: snapshot } };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("inclui manual sem coleção IA e preserva origem, duração e criação reais", () => {
  const merged = mergeEditorClips(project, null, state);
  expect(merged).toHaveLength(1);
  expect(merged[0]).toMatchObject({ mediaId: "m", composition: snapshot, clip: { id, title: "Minha montagem", score: null, origin: "manual", createdAtMs: 1000, start: 0, end: 30 } });
});

it("edição substitui somente o mesmo ID e retira a nota da ordenação", () => {
  const original: ClipCollection = { version: 1, mediaId: "m", transcriptHash: "h", clips: [
    { id, start: 20, end: 50, title: "Título original", score: 95, review: "pending", reasons: [], createdAtMs: 1000, analysis: { title: "T", summary: "S", criteria: [] } },
    { id: "b".repeat(64), start: 0, end: 10, title: "Outro", score: 80, review: "pending", reasons: [], analysis: { title: "T", summary: "S", criteria: [] } },
  ] };
  const merged = mergeEditorClips(project, original, { ...state, clips: { [id]: { document, manuallyEdited: true, editedAtMs: 90000 } } });
  expect(merged).toHaveLength(2);
  expect(merged.find(entry => entry.clip.id === id)?.clip).toMatchObject({ title: "Título original", score: null, originalScore: 95, createdAtMs: 1000, manuallyEdited: true });
  expect(visibleClips(merged, "all", "score")[0].clip.id).toBe("b".repeat(64));
});

it("cards manuais não fabricam nota e exibem duração da montagem salva", () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const html = renderToStaticMarkup(<ClipGallery entries={mergeEditorClips(project, null, state)} onInspect={() => {}} />);
  expect(html).toContain("Manual");
  expect(html).toContain("30 s");
  expect(html).not.toContain("Nota estimada");
  expect(html).not.toContain("/100");
});

it("biblioteca global carrega clipe manual e informa falha parcial sem escondê-lo", async () => {
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "load_editor_project") return state;
    if (command === "get_project_clips") throw new Error("Coleção IA indisponível");
    return null;
  });
  const result = await loadClipLibrary([project]);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0].clip.id).toBe(id);
  expect(result.failed).toEqual([project]);
});
