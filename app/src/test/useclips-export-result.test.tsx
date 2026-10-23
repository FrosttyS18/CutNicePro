import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useClips, type ClipOperationResult } from "../hooks/useClips";
import { reactHost } from "./react-host";

/**
 * UPD-020 (auditoria): o resultado da EXPORTAÇÃO é tipado e verificável no
 * hook — sucesso confirmado, cancelamento do diálogo de destino (IPC false),
 * cancelamento do processamento (job cancelled), falha e bloqueio de início.
 */

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));

type Hook = ReturnType<typeof useClips>;
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let result: { current: ClipOperationResult | null } = { current: null };

async function mountProbe() {
  const ref: { current: Hook | null } = { current: null };
  const Probe = () => {
    ref.current = useClips("p", "m");
    return null as unknown as ReactNode;
  };
  mounted = await reactHost(<Probe/>);
  return ref;
}

afterEach(async () => { await mounted?.close(); mounted = undefined; result = { current: null }; vi.clearAllMocks(); });

describe("resultado tipado da exportação no useClips (upd 20)", () => {
  it("IPC true → sucesso confirmado com aviso de exportado", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => command === "get_clips" ? null : command === "export_video" ? true : null);
    const ref = await mountProbe();
    await act(async () => { result.current = await ref.current!.exportVideo({} as never, "c"); });
    expect(result.current).toEqual({ status: "completed" });
    expect(ref.current!.notice).toBe("Vídeo exportado.");
  });
  it("IPC false (cancelou o diálogo de destino) → sem aviso de sucesso", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => command === "get_clips" ? null : command === "export_video" ? false : null);
    const ref = await mountProbe();
    await act(async () => { result.current = await ref.current!.exportVideo({} as never, "c"); });
    expect(result.current).toEqual({ status: "dialog-cancelled" });
    expect(ref.current!.notice).toBeNull();
  });
  it("job cancelado → cancelamento, não falha", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "export_video") throw new Error("cancelado pelo usuário");
      if (command === "clips_job") {
        const started = vi.mocked(invoke).mock.calls.find(([name]) => name === "export_video");
        return { jobId: (started?.[1] as { jobId?: string } | undefined)?.jobId, projectId: "p", state: "cancelled", stage: "rendering", progress: 30, error: null, operation: "export" };
      }
      return command === "get_clips" ? null : null;
    });
    const ref = await mountProbe();
    await act(async () => { result.current = await ref.current!.exportVideo({} as never, "c"); });
    expect(result.current).toEqual({ status: "cancelled" });
    expect(ref.current!.notice).toBeNull();
  });
  it("erro sem snapshot de job → falha com a mensagem real", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "export_video") throw new Error("falha de renderização");
      return command === "get_clips" ? null : null;
    });
    const ref = await mountProbe();
    await act(async () => { result.current = await ref.current!.exportVideo({} as never, "c"); });
    expect(result.current).toEqual({ status: "failed", error: "Error: falha de renderização" });
    expect(ref.current!.notice).toBeNull();
  });
  it("job em andamento → bloqueado, sem nova chamada de exportação", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => command === "get_clips" ? null
      : command === "clips_job" ? { jobId: "outro", projectId: "p", state: "running", stage: "rendering", progress: 10, error: null, operation: "export" }
      : null);
    const ref = await mountProbe();
    await act(async () => { result.current = await ref.current!.exportVideo({} as never, "c"); });
    expect(result.current).toEqual({ status: "blocked" });
    expect(vi.mocked(invoke).mock.calls.some(([name]) => name === "export_video")).toBe(false);
  });
});
