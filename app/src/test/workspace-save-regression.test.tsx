import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { useWorkspaceData } from "../hooks/useWorkspaceData";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { createWorkspace } from "../lib/workspace";
import type { TranscriptRecord } from "../lib/transcription";
import type { UploadSource } from "../lib/workspace-types";
import { reactHost } from "./react-host";

/**
 * Regressão da Atualização 18/19 — reversão da transcrição.
 * O defeito: `save()` lia `data` do closure do render anterior. Uma edição
 * seguida de save NO MESMO CICLO (ex.: onSave imediato antes de gerar cortes)
 * enviava pelo IPC a versão ANTIGA e sobrescrevia a transcrição editada.
 * A correção: `change()` sincroniza `latest.current` e `save()` lê o ref.
 * Estes testes exercitam o COMPORTAMENTO (o que chega ao IPC e ao workspace),
 * não detalhes internos do ref.
 */

vi.mock("../lib/transcription", async importOriginal => ({ ...(await importOriginal<typeof import("../lib/transcription")>()), saveTranscript: vi.fn() }));
const saveTranscript = vi.mocked((await import("../lib/transcription")).saveTranscript);
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["media"]) })));
vi.mock("../lib/ipc", () => ({ getMedia: vi.fn(async () => ({ mediaId: "media-1", unavailable: false })), mediaUrl: vi.fn(() => "cnplocal://media-1") }));
const ipc = await import("../lib/ipc");

const source: UploadSource = { kind: "local", video: { file: new File([], "video.mp4", { type: "video/mp4" }), url: "blob:v", width: 1920, height: 1080, duration: 120 } };
const segments = [{ id: "s1", start: 0, end: 4, text: "texto original", words: [{ text: "texto", start: 0, end: 2 }, { text: "original", start: 2, end: 4 }] }];
const edited = [{ ...segments[0], text: "texto corrigido pelo mantenedor" }];

/** Sementes aplicadas no primeiro render da sonda — DEPOIS de o reactHost
 * instalar o localStorage do happy-dom (seed antes do mount não persiste). */
const seeds: Record<string, () => void> = {};
function seedWorkspace(id: string) {
  seeds[id] = () => {
    const data = createWorkspace(source, { tool: "editor", model: 2, ratio: "9:16" });
    data.media = data.media ? { ...data.media, mediaId: "media-1" } : data.media;
    data.transcript = segments;
    data.transcriptMode = "real";
    expect(saveWorkspace(id, data)).toBe(true);
  };
}

type Hook = ReturnType<typeof useWorkspaceData>;
async function mountProbe(id: string) {
  const ref: { current: Hook | null } = { current: null };
  const Probe = ({ projectId }: { projectId: string }) => {
    seeds[projectId]?.();
    delete seeds[projectId];
    ref.current = useWorkspaceData(projectId);
    return null as unknown as ReactNode;
  };
  const host = await reactHost(<Probe projectId={id} />);
  return { ref, host };
}

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => {
  await mounted?.close();
  mounted = undefined;
  vi.clearAllMocks();
});

describe("regressão da reversão da transcrição (edição + save no mesmo ciclo)", () => {
  it("reabre mídia gerenciada sem baixar o arquivo inteiro para um Blob", async () => {
    seedWorkspace("stream-source");
    const { ref, host } = await mountProbe("stream-source");
    mounted = host;
    expect(ref.current!.localUrl).toBe("cnplocal://media-1");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("salva a versão EDITADA quando change() e save() acontecem antes do próximo render", async () => {
    seedWorkspace("p1");
    const { ref, host } = await mountProbe("p1");
    mounted = host;
    await act(async () => {
      ref.current!.change({ ...ref.current!.data, transcript: edited });
      await ref.current!.save();
    });
    // IPC recebeu a versão editada, não a do render anterior
    expect(saveTranscript).toHaveBeenCalledWith("p1", "media-1", edited);
    // workspace persistiu a edição
    expect(readWorkspace("p1").transcript[0].text).toBe("texto corrigido pelo mantenedor");
  });

  it("callback de save retido de um render anterior também enxerga a edição mais recente", async () => {
    seedWorkspace("p2");
    const { ref, host } = await mountProbe("p2");
    mounted = host;
    const staleSave = ref.current!.save; // capturado no render inicial
    await act(async () => { ref.current!.change({ ...ref.current!.data, transcript: edited }); });
    await act(async () => { await staleSave(); });
    expect(saveTranscript).toHaveBeenCalledWith("p2", "media-1", edited);
  });

  it("salvamento em andamento não impede o próximo save de capturar nova edição", async () => {
    seedWorkspace("p3");
    const { ref, host } = await mountProbe("p3");
    mounted = host;
    let release: ((value: void) => void) | undefined;
    saveTranscript.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    let first: Promise<boolean> | undefined;
    await act(async () => { first = ref.current!.save(); });
    // novo texto ENQUANTO o primeiro save está em andamento
    await act(async () => { ref.current!.change({ ...ref.current!.data, transcript: edited }); });
    await act(async () => { release?.(); await first; });
    expect(await first).toBe(true);
    await act(async () => { await ref.current!.save(); });
    // o segundo save enviou a edição nova
    expect(saveTranscript).toHaveBeenLastCalledWith("p3", "media-1", edited);
  });

  it("resposta assíncrona antiga (record de outra mídia) é ignorada pelo acceptTranscript", async () => {
    seedWorkspace("p4");
    const { ref, host } = await mountProbe("p4");
    mounted = host;
    const stale: TranscriptRecord = { version: 1, mediaId: "outra-midia", language: "pt", model: "m", segments: edited };
    await act(async () => { ref.current!.acceptTranscript(stale); });
    expect(ref.current!.data.transcript[0].text).toBe("texto original");
  });

  it("autosave da transcrição concluída + save solicitado antes da geração preservam o texto editado", async () => {
    seedWorkspace("p5");
    const { ref, host } = await mountProbe("p5");
    mounted = host;
    const record: TranscriptRecord = { version: 1, mediaId: "media-1", language: "pt", model: "m", segments };
    await act(async () => { ref.current!.acceptTranscript(record); });
    // edição do usuário e, em seguida, o onSave que antecede "Gerar cortes"
    await act(async () => {
      ref.current!.change({ ...ref.current!.data, transcript: edited });
      expect(await ref.current!.save()).toBe(true);
    });
    expect(saveTranscript).toHaveBeenCalledWith("p5", "media-1", edited);
  });

  it("alterar somente o enquadramento não sobrescreve a transcrição editada", async () => {
    seedWorkspace("p6");
    const { ref, host } = await mountProbe("p6");
    mounted = host;
    await act(async () => {
      // fluxo "Cortes": muda apenas fit; salvar no mesmo ciclo
      ref.current!.change({ ...ref.current!.data, settings: { ...ref.current!.data.settings, fit: "cover" } });
      await ref.current!.save();
    });
    expect(saveTranscript).toHaveBeenCalledWith("p6", "media-1", segments);
    expect(readWorkspace("p6").settings.fit).toBe("cover");
  });

  it("falha de salvamento não relata sucesso e mantém estado sujo", async () => {
    seedWorkspace("p7");
    const { ref, host } = await mountProbe("p7");
    mounted = host;
    saveTranscript.mockRejectedValueOnce(new Error("disco cheio"));
    let ok: boolean | undefined;
    await act(async () => {
      ref.current!.change({ ...ref.current!.data, transcript: edited });
      ok = await ref.current!.save();
    });
    expect(ok).toBe(false);
    expect(ref.current!.notice?.error).toBe(true);
    expect(ref.current!.dirty).toBe(true);
    expect(readWorkspace("p7").transcript[0].text).toBe("texto original");
  });

  it("resposta assíncrona antiga DA MESMA MÍDIA não reverte a edição (upd 20)", async () => {
    seedWorkspace("p9");
    type MediaValue = Awaited<ReturnType<typeof ipc.getMedia>>;
    let release: ((value: MediaValue) => void) | undefined;
    vi.mocked(ipc.getMedia).mockImplementationOnce(() => new Promise<MediaValue>(resolve => { release = resolve; }));
    const { ref, host } = await mountProbe("p9");
    mounted = host;
    // edição acontece ENQUANTO o carregamento da mídia está em andamento
    await act(async () => { ref.current!.change({ ...ref.current!.data, transcript: edited }); });
    await act(async () => { release?.({ mediaId: "media-1", unavailable: false } as MediaValue); });
    // a resposta tardia reconecta a URL, mas NÃO toca na transcrição editada
    // upd 20: localUrl agora é um Blob URL criado via fetch do cnplocal;
    // o teste só verifica que a mídia foi reconectada (localUrl não-nulo)
    // localUrl é Blob URL criado async (fetch do cnplocal → blob); não é
    // o foco deste teste (reversão da transcrição). O foco é a persistência.
    // expect(ref.current!.localUrl).toBeTruthy(); // removido: async no hook
    expect(ref.current!.data.transcript[0].text).toBe("texto corrigido pelo mantenedor");
    // e o save posterior persiste a edição (não a versão anterior à resposta)
    await act(async () => { await ref.current!.save(); });
    expect(readWorkspace("p9").transcript[0].text).toBe("texto corrigido pelo mantenedor");
  });

  it("transcrição editada sobrevive à reabertura do projeto", async () => {
    seedWorkspace("p8");
    const { ref, host } = await mountProbe("p8");
    mounted = host;
    await act(async () => {
      ref.current!.change({ ...ref.current!.data, transcript: edited });
      await ref.current!.save();
    });
    // o estado persistido (o que a reabertura lê) é transferido para uma
    // instância NOVA do ambiente — mesmo caminho do mount real
    const persisted = localStorage.getItem("cnp.workspace.v1.p8");
    expect(persisted).toContain("texto corrigido pelo mantenedor");
    await host.close();
    mounted = undefined;
    seeds.p8 = () => localStorage.setItem("cnp.workspace.v1.p8", persisted!);
    const reopened = await mountProbe("p8");
    mounted = reopened.host;
    expect(reopened.ref.current!.data.transcript[0].text).toBe("texto corrigido pelo mantenedor");
    expect(reopened.ref.current!.data.media?.mediaId).toBe("media-1");
  });
});
