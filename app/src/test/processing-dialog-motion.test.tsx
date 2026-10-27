import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { ProcessingDialog } from "../components/workspace/ProcessingDialog";
import { reactHost } from "./react-host";

let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; });

it("controle de movimento usa tooltip do projeto e preserva pausa, foco, Escape e descarte", async () => {
  const cancel = vi.fn(async () => true), retry = vi.fn();
  view = await reactHost(<ProcessingDialog open id="job" busy title="Processando" status="Preparando vídeo" progress={0} error="" cancelDescription="Seu trabalho será mantido."
    onClose={vi.fn()} onCancel={cancel} onRetry={retry} cancelAction="Cancelar exportação"/>);
  const owner = view.host.ownerDocument;
  const button = view.host.querySelector<HTMLButtonElement>(".thinking-motion-toggle")!;
  expect(button.hasAttribute("title")).toBe(false);
  await act(async () => button.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true })));
  expect(document.querySelector('[role="tooltip"].editor-tooltip')?.textContent).toBe("Pausar animação");
  expect(document.querySelector('[role="tooltip"]')?.parentElement).toBe(view.host.querySelector("dialog[open]"));
  expect(button.getAttribute("aria-describedby")).toBe(document.querySelector('[role="tooltip"]')?.id);
  await act(async () => button.dispatchEvent(new window.MouseEvent("mouseout", { bubbles: true })));
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  await act(async () => button.focus());
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  await act(async () => button.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector('[role="tooltip"]')).toBeNull(); expect(document.activeElement).toBe(button);
  await act(async () => button.click());
  expect(view.host.querySelector("dialog.animation-paused")).not.toBeNull();
  expect(button.getAttribute("aria-label")).toBe("Retomar animação");
  await act(async () => button.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true })));
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Retomar animação");
  await act(async () => button.click());
  expect(view.host.querySelector("dialog.animation-paused")).toBeNull();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(cancel).not.toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
  await act(async () => { button.blur(); button.focus(); });
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  await view.render(<ProcessingDialog open={false} id="job" busy title="Processando" status="Preparando vídeo" progress={0} error="" cancelDescription="Seu trabalho será mantido."
    onClose={vi.fn()} onCancel={cancel} onRetry={retry} cancelAction="Cancelar exportação"/>);
  expect(owner.querySelector('[role="tooltip"]')).toBeNull();
  await view.close(); view = undefined;
  expect(owner.querySelector('[role="tooltip"]')).toBeNull();
});

it("preserva a regra existente de redução de movimento sem novo estilo ou animação", () => {
  const css = readFileSync(new URL("../components/workspace/transcription.css", import.meta.url), "utf8");
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.thinking-orb i[^}]*animation:\s*none/s);
});

it.each(["hidden", "failed", "confirm"] as const)("tooltip não permanece após sair do progresso: %s", async transition => {
  const props = { id: "job", title: "Processando", status: "Preparando vídeo", progress: 0, error: "Falha no processamento.", cancelDescription: "Seu trabalho será mantido.",
    onClose: vi.fn(), onCancel: vi.fn(async () => true), onRetry: vi.fn(), cancelAction: "Cancelar exportação" };
  view = await reactHost(<ProcessingDialog {...props} open busy/>);
  const button = view.host.querySelector<HTMLButtonElement>(".thinking-motion-toggle")!;
  await act(async () => button.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true })));
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  if (transition === "confirm") {
    await view.click("Cancelar"); expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await view.click("Continuar");
  } else await view.render(<ProcessingDialog {...props} open={transition !== "hidden"} busy={transition !== "failed"}/>);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
});

it("retry no mesmo componente não ressuscita tooltip sem novo hover ou foco", async () => {
  const props = { id: "job", title: "Processando", status: "Preparando vídeo", progress: 0, error: "Falha no processamento.", cancelDescription: "Seu trabalho será mantido.",
    onClose: vi.fn(), onCancel: vi.fn(async () => true), onRetry: vi.fn(), cancelAction: "Cancelar exportação" };
  view = await reactHost(<ProcessingDialog {...props} open busy/>);
  await act(async () => view!.host.querySelector(".thinking-motion-toggle")!.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true })));
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  await view.render(<ProcessingDialog {...props} open busy={false}/>);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  await view.render(<ProcessingDialog {...props} open busy/>);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  await act(async () => view!.host.querySelector<HTMLButtonElement>(".thinking-motion-toggle")!.focus());
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Pausar animação");
});
