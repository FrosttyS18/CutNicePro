import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TranscriptionDialog } from "../components/workspace/TranscriptionDialog";
import { TranscriptionControls } from "../components/workspace/TranscriptionControls";
import { PreparationDialog } from "../components/upload/PreparationDialog";
import { transcriptionMessage } from "../lib/transcription-feedback";
import type { TranscriptionJob } from "../lib/transcription";

const job: TranscriptionJob = { jobId: "j", projectId: "p", state: "running", stage: "transcribing", progress: 45, error: null };
const noop = () => {};
const cancel = async () => true;

describe("feedback da transcrição sem navegador", () => {
  it("mostra porcentagem também na importação a partir dos bytes copiados", () => {
    const html = renderToStaticMarkup(<PreparationDialog open busy name="Vídeo.mp4" error={null} progress={{ copied: 5, total: 20 }} onClose={noop} onRetry={noop} />);
    expect(html).toContain("25%");
    expect(html).toContain('value="0.25"');
  });
  it("renderiza modal com porcentagem recebida e progresso acessível", () => {
    const html = renderToStaticMarkup(<TranscriptionDialog open job={job} onClose={noop} onCancel={cancel} onRetry={noop} />);
    expect(html).toContain("0%");
    expect(html).toContain('value="0" max="100"');
    expect(html).toContain('aria-label="Transcrição do vídeo"');
    expect(html).toContain("Mantenha o aplicativo aberto");
    expect(html).toContain("Cancelar");
    expect(html).not.toMatch(/Whisper|Base|CPU|motor|implementação/);
  });
  it("exibe causa e ação sem vazar erro interno ou caminho", () => {
    const html = renderToStaticMarkup(<TranscriptionDialog open job={{ ...job, state: "failed", error: "transcrição contém identificadores ou posições inválidas: C:\\private\\video.mp4" }} onClose={noop} onCancel={cancel} onRetry={noop} />);
    expect(html).toContain("Não foi possível sincronizar");
    expect(html).toContain("Tentar novamente");
    expect(html).not.toMatch(/identificadores|private|video\.mp4/);
    expect(html).not.toContain("45%");
  });
  it("não mostra diagnóstico do motor nos controles", () => {
    const controller = { job: null, ready: true, loaded: true, error: null, busy: false, profiles:[], start: async () => {}, cancel: async () => true, retry: noop };
    const html = renderToStaticMarkup(<TranscriptionControls controller={controller} generated={false} dirty={false} />);
    expect(html).toContain("Transcrever");
    expect(html).not.toContain("em português");
    expect(html).not.toMatch(/Whisper|Base|CPU|motor|processamento neste computador/);
  });
  it("mapeia erros para causa e ação sem expor diagnóstico técnico", () => {
    expect(transcriptionMessage("ffmpeg spawn error 5 C:\\private")).not.toMatch(/ffmpeg|spawn|private/);
    expect(transcriptionMessage("não tem faixa de áudio")).toContain("Escolha um vídeo com fala");
    expect(transcriptionMessage("arquivo ausente do disco")).toContain("Importe o vídeo novamente");
    expect(transcriptionMessage("detalhe técnico desconhecido")).toBe("Não foi possível transcrever este vídeo. Tente novamente.");
  });
});
