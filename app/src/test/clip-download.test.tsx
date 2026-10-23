import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipDownload } from "../components/clips/ClipDownload";
import type { ClipOperationResult } from "../hooks/useClips";
import { reactHost } from "./react-host";
import type { LibraryClip } from "../lib/clip-library";

/**
 * UPD-020 (auditoria): "Vídeo exportado" só pode aparecer quando o arquivo
 * foi EFETIVAMENTE publicado. Falha, cancelamento (diálogo ou processamento)
 * e bloqueio de início têm estados próprios — e mídia indisponível não
 * inicia exportação nem deixa o executor invisível/preso.
 */

const exportVideo = vi.fn();
const useClipsMock = () => ({ collection: null, job: null, ownedJob: true, operation: "export" as const,
  busy: false, loading: false, error: null, notice: null, generate: vi.fn(), analyze: vi.fn(),
  exportVideo, review: vi.fn(), remove: vi.fn(), restore: vi.fn(), cancel: vi.fn(async () => true), reload: vi.fn() });
vi.mock("../hooks/useClips", () => ({ useClips: () => useClipsMock() }));
const mediaState = { source: null as object | null, loading: true, error: null as string | null };
vi.mock("../hooks/useClipMedia", () => ({ useClipMedia: () => mediaState }));
vi.mock("../services/workspace-store", () => ({ readWorkspace: () => ({ clipEdits: {} }) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));

const entry: LibraryClip = { project: { id: "p", name: "Projeto", created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null }, mediaId: "m",
  clip: { id: "a".repeat(64), start: 10, end: 60, title: "Trecho", score: 80, reasons: [], review: "pending" } };

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks();
  mediaState.source = null; mediaState.loading = true; mediaState.error = null; });

const close = vi.fn();
async function mount(changed: (notice?: string) => void = () => undefined) {
  close.mockClear();
  mounted = await reactHost(<ClipDownload entry={entry} onClose={close} onChanged={changed}/>);
}

describe("resultado real do download por card (upd 20)", () => {
  it("sucesso confirmado é o único que anuncia 'Vídeo exportado'", async () => {
    const changed = vi.fn(); exportVideo.mockResolvedValue({ status: "completed" } satisfies ClipOperationResult);
    mediaState.loading = false; mediaState.source = { media: null };
    mounted = await reactHost(<ClipDownload entry={entry} onClose={() => undefined} onChanged={changed}/>);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith("Vídeo exportado."));
    expect(exportVideo).toHaveBeenCalledTimes(1);
  });
  it("cancelamento do diálogo de destino NÃO anuncia sucesso e fecha em silêncio", async () => {
    const changed = vi.fn(); exportVideo.mockResolvedValue({ status: "dialog-cancelled" } satisfies ClipOperationResult);
    mediaState.loading = false; mediaState.source = { media: null };
    await mount(changed);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith());
    expect(changed).not.toHaveBeenCalledWith("Vídeo exportado.");
  });
  it("cancelamento do processamento NÃO anuncia sucesso", async () => {
    const changed = vi.fn(); exportVideo.mockResolvedValue({ status: "cancelled" } satisfies ClipOperationResult);
    mediaState.loading = false; mediaState.source = { media: null };
    await mount(changed);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith());
    expect(changed).not.toHaveBeenCalledWith("Vídeo exportado.");
  });
  it("falha mantém executor visível com a mensagem — sem aviso de sucesso", async () => {
    const changed = vi.fn(); exportVideo.mockResolvedValue({ status: "failed", error: "ffmpeg" } satisfies ClipOperationResult);
    mediaState.loading = false; mediaState.source = { media: null };
    await mount();
    await vi.waitFor(() => expect(mounted!.host.querySelector('[role="alert"]')).not.toBeNull());
    expect(mounted!.host.textContent).not.toContain("Vídeo exportado");
    expect(changed).not.toHaveBeenCalled();
  });
  it("operação bloqueada (já em andamento) mostra orientação sem iniciar exportação", async () => {
    exportVideo.mockResolvedValue({ status: "blocked" } satisfies ClipOperationResult);
    mediaState.loading = false; mediaState.source = { media: null };
    await mount();
    await vi.waitFor(() => expect(mounted!.host.textContent).toContain("processamento em andamento"));
    expect(mounted!.host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("mídia indisponível NÃO inicia exportação e mostra erro com fechar", async () => {
    mediaState.loading = false; mediaState.error = "vídeo ausente";
    await mount();
    await vi.waitFor(() => expect(mounted!.host.textContent).toContain("Não foi possível carregar"));
    expect(exportVideo).not.toHaveBeenCalled();
    expect(mounted!.host.querySelector('[role="alert"]')).not.toBeNull();
  });
});
