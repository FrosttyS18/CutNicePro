import { act, StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SavedClipDownload } from "../components/clips/SavedClipDownload";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";

const native = vi.hoisted(() => ({ export: vi.fn(), listen: vi.fn(), off: vi.fn() }));
vi.mock("../lib/ipc", () => ({ exportEditorDocument: native.export }));
vi.mock("@tauri-apps/api/event", () => ({ listen: native.listen }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
const document = { ...compositionFromLegacy(emptyWorkspace()), revision: 1 };
const entry: LibraryClip = { project: { id: "project", name: "Projeto", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }, mediaId: "media",
  clip: { id: "a".repeat(64), start: 0, end: 10, title: "Manual", score: null, reasons: [], review: "pending", origin: "manual" },
  composition: { document, manuallyEdited: false, editedAtMs: 1, origin: "manual", title: "Manual", createdAtMs: 1 } };
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
beforeEach(() => { native.listen.mockResolvedValue(native.off); });
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.resetAllMocks(); });

it("StrictMode inicia exatamente uma exportação e não fecha antes da resposta nativa", async () => {
  let finish!: (value: boolean) => void;
  native.export.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const close = vi.fn(), changed = vi.fn();
  mounted = await reactHost(<StrictMode><SavedClipDownload entry={entry} onClose={close} onChanged={changed} /></StrictMode>);
  expect(native.export).toHaveBeenCalledTimes(1);
  expect(native.export).toHaveBeenCalledWith("project", entry.clip.id, expect.any(String), document);
  expect(close).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  await act(async () => finish(true));
  expect(close).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledWith("Vídeo exportado.");
  expect(native.off).toHaveBeenCalledTimes(1);
});

it("desmontar durante listen pendente não inicia exportação nem entrega callbacks antigos", async () => {
  let subscribe!: (off: () => void) => void;
  native.listen.mockImplementation(() => new Promise<() => void>(resolve => { subscribe = resolve; }));
  const close = vi.fn(), changed = vi.fn();
  mounted = await reactHost(<StrictMode><SavedClipDownload entry={entry} onClose={close} onChanged={changed} /></StrictMode>);
  await mounted.close(); mounted = undefined;
  await act(async () => subscribe(native.off));
  expect(native.export).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(native.off).toHaveBeenCalledTimes(1);
});

it("resposta depois da desmontagem não fecha um download posterior nem publica sucesso", async () => {
  let finish!: (value: boolean) => void;
  native.export.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const close = vi.fn(), changed = vi.fn();
  mounted = await reactHost(<SavedClipDownload entry={entry} onClose={close} onChanged={changed} />);
  expect(native.export).toHaveBeenCalledTimes(1);
  await mounted.render(<p>Outra tela</p>);
  await act(async () => finish(true));
  expect(close).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});
