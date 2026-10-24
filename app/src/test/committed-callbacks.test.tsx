import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { VideoPreview } from "../components/workspace/VideoPreview";
import { TranscriptPanel } from "../components/workspace/TranscriptPanel";
import { usePlaybackShortcut } from "../hooks/usePlaybackShortcut";
import { useTranscription } from "../hooks/useTranscription";
import type { TranscriptRecord } from "../lib/transcription";
import { defaultEditorSettings } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => vi.fn()) }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.resetAllMocks(); });

function Playback({ toggle }: { toggle: () => void }) {
  usePlaybackShortcut(true, toggle);
  return <p>Editor</p>;
}
function Transcription({ mediaId, receive }: { mediaId?: string; receive: (record: TranscriptRecord) => void }) {
  const { loaded, ready, job, error } = useTranscription("p", mediaId, receive);
  return <output>{JSON.stringify({ loaded, ready, job, error })}</output>;
}

describe("referências sincronizadas após confirmar a renderização", () => {
  it("o atalho usa somente o callback atual e remove o listener ao desmontar", async () => {
    const old = vi.fn(), current = vi.fn();
    mounted = await reactHost(<Playback toggle={old} />);
    vi.stubGlobal("Element", window.Element);
    await mounted.render(<Playback toggle={current} />);
    const page = window;
    const press = () => page.dispatchEvent(new page.KeyboardEvent("keydown", { key: " ", cancelable: true }));
    await act(async () => { press(); });
    expect(old).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledOnce();
    await mounted.close(); mounted = undefined;
    press();
    expect(current).toHaveBeenCalledOnce();
  });

  it("a prévia usa o novo callback de tempo e limpa o erro ao trocar a fonte", async () => {
    const old = vi.fn(), current = vi.fn();
    const settings = defaultEditorSettings();
    const props = { media: null, settings };
    mounted = await reactHost(<VideoPreview {...props} localUrl="blob:old" onTime={old} />);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    await act(async () => { mounted!.host.querySelector("video")!.dispatchEvent(new window.Event("error")); });
    expect(mounted.host.querySelector('[role="alert"]')).not.toBeNull();
    await mounted.render(<VideoPreview {...props} localUrl="blob:new" onTime={current} />);
    expect(mounted.host.querySelector('[role="alert"]')).toBeNull();
    const video = mounted.host.querySelector("video")!;
    video.currentTime = 12;
    await act(async () => { video.dispatchEvent(new window.Event("pause")); });
    expect(current).toHaveBeenLastCalledWith(12);
    expect(old).not.toHaveBeenCalled();
  });

  it("a transcrição segue a fala atual sem impedir o recolhimento manual", async () => {
    const props = { demo: false, canSeek: false, onSeek: vi.fn(), onText: vi.fn(),
      segments: [{ id: "one", start: 0, end: 10, text: "Primeiro assunto." }, { id: "two", start: 90, end: 100, text: "Segundo assunto." }] };
    mounted = await reactHost(<TranscriptPanel {...props} currentTime={1} />);
    const buttons = () => Array.from(mounted!.host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'));
    expect(buttons().map(button => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    await act(async () => { buttons()[0].click(); });
    await mounted.render(<TranscriptPanel {...props} currentTime={2} />);
    expect(buttons()[0].getAttribute("aria-expanded")).toBe("false");
    await mounted.render(<TranscriptPanel {...props} currentTime={91} />);
    expect(buttons().map(button => button.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
  });

  it("entrega a transcrição pendente ao callback atual e limpa o estado sem mídia", async () => {
    let resolveMedia!: (value: unknown) => void;
    const media = new Promise<unknown>(resolve => { resolveMedia = resolve; });
    const record: TranscriptRecord = { version: 1, mediaId: "m", language: "pt", model: "turbo", segments: [] };
    vi.mocked(invoke).mockImplementation(async command => {
      if (command === "get_media") return media;
      if (command === "get_transcript") return record;
      if (command === "transcription_status") return { available: true, model: "turbo", error: null };
      return null;
    });
    const old = vi.fn(), current = vi.fn();
    mounted = await reactHost(<Transcription mediaId="m" receive={old} />);
    await mounted.render(<Transcription mediaId="m" receive={current} />);
    await act(async () => { resolveMedia({ unavailable: false, analysis: { hasAudio: true } }); });
    expect(current).toHaveBeenCalledWith(record);
    expect(old).not.toHaveBeenCalled();
    expect(JSON.parse(mounted.host.textContent!)).toMatchObject({ loaded: true, ready: true });
    await mounted.render(<Transcription receive={current} />);
    expect(JSON.parse(mounted.host.textContent!)).toEqual({ loaded: false, ready: false, job: null, error: null });
  });
});

