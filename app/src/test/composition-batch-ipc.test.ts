import { afterEach, expect, it, vi } from "vitest";
import { saveEditorBatch, saveEditorRecovery } from "../lib/ipc";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
afterEach(() => vi.resetAllMocks());
const document = compositionFromLegacy(emptyWorkspace());
const related = [{ clipId: "b".repeat(64), expectedRevision: 4, document, baseDocument: document }];

it("lote usa argumentos nomeados planos e não envia baseline ao comando de Save", async () => {
  await saveEditorBatch("projeto", null, document, 2, related, false);
  expect(native.invoke).toHaveBeenCalledTimes(1);
  expect(native.invoke).toHaveBeenCalledWith("save_editor_batch", { projectId: "projeto", clipId: null, document, expectedRevision: 2,
    related: [{ clipId: related[0].clipId, expectedRevision: 4, document }], activeChanged: false });
});
it("recuperação preserva payload antigo e envia baseline somente quando houver lote", async () => {
  await saveEditorRecovery("projeto", null, document, 2);
  expect(native.invoke).toHaveBeenLastCalledWith("save_editor_recovery", { projectId: "projeto", clipId: null, document, baseRevision: 2 });
  await saveEditorRecovery("projeto", null, document, 2, related);
  expect(native.invoke).toHaveBeenLastCalledWith("save_editor_recovery", { projectId: "projeto", clipId: null, document, baseRevision: 2, related });
});
