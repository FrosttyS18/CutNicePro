import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useTranscription } from "../hooks/useTranscription";
import { PreparationRecoveryNotice } from "../components/workspace/PreparationRecoveryNotice";
import { beginPreparation, completePreparation, readPreparation, setPreparationOutcome } from "../services/project-preparation-state";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });

it("aviso persiste na reabertura, some ao concluir e não reinicia ASR", async () => {
  mounted = await reactHost(<PreparationRecoveryNotice projectId="p" mediaId="m" busy={false} />);
  await act(async () => {
    beginPreparation("p", "m", "old");
    setPreparationOutcome("p", "m", "old", "interrupted", "Preparação interrompida. Use Transcrever para retomar.");
  });
  expect(mounted.host.textContent).toContain("Preparação interrompida");
  expect(invoke).not.toHaveBeenCalled();
  await mounted.render(<PreparationRecoveryNotice projectId="p" mediaId="m" busy />);
  expect(mounted.host.textContent).toBe("");
  await mounted.render(<PreparationRecoveryNotice projectId="p" mediaId="m" busy={false} />);
  await act(async () => { completePreparation("p", "m", "old"); });
  expect(mounted.host.textContent).toBe("");
});

it("resultado de outra mídia mantém o registro do retry como falha recuperável", async () => {
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "get_media") return { unavailable: false, analysis: { hasAudio: true } };
    if (command === "transcription_status") return { available: true, model: "turbo", error: null };
    if (command === "transcribe_project") return { version: 1, mediaId: "other", language: "pt", model: "turbo", segments: [] };
    return null;
  });
  let controller!: ReturnType<typeof useTranscription>;
  const receive = vi.fn();
  function Probe() { controller = useTranscription("p", "m", receive); return null; }
  mounted = await reactHost(<Probe />);
  expect(controller.ready).toBe(true);
  await act(async () => { await controller.start(); });
  expect(receive).not.toHaveBeenCalled();
  expect(readPreparation("p")).toMatchObject({ mediaId: "m", state: "failed" });
});

it("retry correspondente limpa registro só depois de receber a transcrição persistida", async () => {
  let finish!: (record: unknown) => void;
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "get_media") return { unavailable: false, analysis: { hasAudio: true } };
    if (command === "transcription_status") return { available: true, model: "turbo", error: null };
    if (command === "transcribe_project") return new Promise(resolve => { finish = resolve; });
    return null;
  });
  let controller!: ReturnType<typeof useTranscription>;
  const receive = vi.fn();
  function Probe() { controller = useTranscription("p", "m", receive); return null; }
  mounted = await reactHost(<Probe />);
  let pending!: Promise<void>;
  await act(async () => { pending = controller.start(); });
  expect(readPreparation("p")).toMatchObject({ mediaId: "m", state: "running" });
  await act(async () => { finish({ version: 1, mediaId: "m", language: "pt", model: "turbo", segments: [] }); await pending; });
  expect(receive).toHaveBeenCalledTimes(1);
  expect(readPreparation("p")).toBeNull();
});
