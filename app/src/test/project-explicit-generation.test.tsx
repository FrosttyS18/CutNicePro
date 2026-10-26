import { afterEach, expect, it, vi } from "vitest";
import { emptyWorkspace } from "../lib/workspace";
import { ProjectWorkspace } from "../screens/ProjectWorkspace";
import { reactHost } from "./react-host";

const state = vi.hoisted(() => ({ generate: vi.fn(async () => ({ status: "completed" })) }));
vi.mock("../hooks/useWorkspaceData", () => ({ useWorkspaceData: () => {
  const data = emptyWorkspace();
  data.media = { kind: "local", name: "Vídeo", mediaId: "m", duration: 30, width: 640, height: 360, videoId: null, url: null };
  data.transcriptMode = "real";
  data.transcript = [{ id: "s", start: 0, end: 2, text: "Fala disponível" }];
  return { data, localUrl: "blob:video", dirty: false, notice: null, save: async () => true };
} }));
vi.mock("../services/workspace-store", () => ({ autoGenerateEnabled: () => true, autoGenerateConsumed: () => false, consumeAutoGenerate: vi.fn() }));
vi.mock("../hooks/useTranscription", () => ({ useTranscription: () => ({ busy: false }) }));
vi.mock("../hooks/useClips", () => ({ useClips: () => ({ generate: state.generate, busy: false, loading: false, collection: null }) }));
vi.mock("../components/workspace/ProjectOverview", () => ({ ProjectOverview: () => <p>Visão geral</p> }));
vi.mock("../components/clips/ClipFeedback", () => ({ ClipFeedback: () => null }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });
it("abrir projeto transcrito não inicia geração mesmo com preferência antiga ativada", async () => {
  mounted = await reactHost(<ProjectWorkspace project={{ id: "p", name: "Projeto", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }}
    onRename={async () => {}} onImport={() => {}} onDelete={async () => {}} />);
  expect(state.generate).not.toHaveBeenCalled();
  expect(mounted.host.textContent).toContain("Visão geral");
});
