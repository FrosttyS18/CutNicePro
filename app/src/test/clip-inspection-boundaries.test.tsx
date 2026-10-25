import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ClipInspection } from "../components/clips/ClipInspection";
import type { VideoPreview } from "../components/workspace/VideoPreview";
import type { LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";
import { captionCue } from "../lib/captions";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));
vi.mock("../hooks/useClipMedia", () => ({ useClipMedia: () => ({ loading: false, error: null,
  source: { url: "blob:test", media: { width: 1920, height: 1080 }, transcript: [
    { id: "included", start: 0, end: 30, text: "Fim da resposta.", words: [] },
    { id: "excluded", start: 30, end: 40, text: "Ou uma explicação que não está no corte.", words: [] },
  ] },
}) }));
vi.mock("../components/workspace/VideoPreview", () => ({ VideoPreview: ({ cue, onTime }: ComponentProps<typeof VideoPreview>) =>
  <><button type="button" onClick={() => onTime?.(30)}>Fim do corte</button><p data-testid="cue">{cue?.words.map(word => word.text).join(" ")}</p></>,
}));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });

it("não mostra a primeira legenda do trecho seguinte ao pausar no fim do corte", async () => {
  const entry: LibraryClip = { project: { id: "boundary-project", name: "Projeto", created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null }, mediaId: "m",
    clip: { id: "b".repeat(64), start: 0, end: 30, title: "Uma resposta completa", score: 80, reasons: [], review: "pending" } };
  mounted = await reactHost(<ClipInspection entry={entry} onClose={() => undefined} onEdit={() => undefined} />);
  await mounted.click("Fim do corte");
  const caption = mounted.host.querySelector('[data-testid="cue"]')?.textContent;
  expect(caption).not.toContain("Ou uma");
  expect(caption).toContain("Fim da resposta");
});

it("limita as palavras quando o fim do corte está dentro de um segmento", () => {
  const cue = captionCue([{ id: "crossing", start: 29, end: 32, text: "Fim certo Outra história", words: [
    {text:"Fim",start:29,end:29.4},{text:"certo",start:29.4,end:30},
    {text:"Outra",start:30,end:31},{text:"história",start:31,end:32},
  ] }],29.999,5,{start:29,end:30});
  expect(cue?.words.map(word=>word.text)).toEqual(["Fim","certo"]);
});
