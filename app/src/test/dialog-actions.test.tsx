import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectNameDialog } from "../components/upload/ProjectNameDialog";
import { ProjectDeleteDialog } from "../components/workspace/ProjectDeleteDialog";
import { NewProjectDialog } from "../components/NewProjectDialog";
import { NewCollectionDialog } from "../components/NewCollectionDialog";
import { AddProjectsDialog } from "../screens/CollectionScreen";
import { ProcessingDialog } from "../components/workspace/ProcessingDialog";
import { FlowDialog } from "../components/workspace/FlowDialog";
import { reactHost } from "./react-host";

const css = ["../global.css", "../ui.css", "../screens/workspace.css", "../screens/upload.css", "../components/workspace/project-actions.css"]
  .map(path => readFileSync(new URL(path, import.meta.url), "utf8"));
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; });
function styles(reverse = false) {
  const element = document.createElement("style"); element.textContent = (reverse ? [...css].reverse() : css).join("\n"); document.head.append(element);
}
function button(text: string) {
  return Array.from(view!.host.querySelectorAll("button")).find(node => node.textContent?.trim() === text)!;
}
function color(value: string) {
  if (/^#[a-f\d]{3}$/i.test(value)) return `#${value.slice(1).split("").map(channel => channel + channel).join("")}`.toLowerCase();
  return value.startsWith("#") ? value.toLowerCase() : `#${(value.match(/\d+/g) ?? []).slice(0, 3).map(channel => Number(channel).toString(16).padStart(2, "0")).join("")}`;
}
function palette(text: string) {
  const style = window.getComputedStyle(button(text)); return [color(style.backgroundColor), color(style.color)];
}

it.each([false, true])("Cancelar fica secundário e criar branco/preto, ordem CSS invertida %s", async reverse => {
  view = await reactHost(<ProjectNameDialog open name="Projeto" onName={vi.fn()} onClose={vi.fn()} onCreate={vi.fn()}/>); styles(reverse);
  expect(palette("Criar projeto")).toEqual(["#ffffff", "#0a0a0a"]);
  expect(palette("Cancelar")).toEqual(["#202020", "#b3b3b3"]);
  const outside = document.createElement("button"); outside.className = "flow-button dialog-action--secondary"; view.host.append(outside);
  expect(color(window.getComputedStyle(outside).backgroundColor)).toBe("#ffffff");
});

it("mantém confirmação branca e Cancelar secundário nos três diálogos legados", async () => {
  const close = vi.fn();
  view = await reactHost(<NewProjectDialog onClose={close} onCreate={vi.fn()}/>); styles();
  expect(palette("Criar")).toEqual(["#ffffff", "#0a0a0a"]); expect(palette("Cancelar")).toEqual(["#202020", "#b3b3b3"]);
  await view.render(<NewCollectionDialog onClose={close} onCreate={vi.fn()}/>);
  expect(palette("Criar")).toEqual(["#ffffff", "#0a0a0a"]); expect(palette("Cancelar")).toEqual(["#202020", "#b3b3b3"]);
  await view.render(<AddProjectsDialog projects={[{ id: "p", name: "Projeto", created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null }]} onAdd={vi.fn()} onClose={close}/>);
  expect(palette("Adicionar (0)")).toEqual(["#ffffff", "#0a0a0a"]); expect(palette("Cancelar")).toEqual(["#202020", "#b3b3b3"]);
});

it("exclusão mantém ação destrutiva escura, falha e cancelamento preservados", async () => {
  const close = vi.fn(); const remove = vi.fn(async () => { throw new Error("ocupado"); });
  view = await reactHost(<ProjectDeleteDialog name="Projeto" onClose={close} onDelete={remove}/>); styles();
  expect(palette("Excluir projeto")).toEqual(["#321c1d", "#ffb4b4"]);
  expect(palette("Cancelar")).toEqual(["#202020", "#b3b3b3"]);
  await view.click("Excluir projeto"); expect(remove).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível");
  await view.click("Cancelar"); expect(close).toHaveBeenCalledTimes(1);
});

it("continuar processamento tem prioridade e interrupção mantém confirmação e erro", async () => {
  const cancel = vi.fn(async () => false); const close = vi.fn();
  view = await reactHost(<ProcessingDialog open id="job" busy title="Exportando" status="Renderizando" progress={20} error="" cancelDescription="Seu clipe será mantido." onClose={close} onCancel={cancel} onRetry={vi.fn()} cancelAction="Cancelar exportação"/>); styles();
  await view.click("Cancelar");
  expect(palette("Continuar")).toEqual(["#ffffff", "#000000"]);
  expect(palette("Cancelar exportação")).toEqual(["#202020", "#b3b3b3"]);
  await view.click("Continuar"); expect(cancel).not.toHaveBeenCalled();
  await view.click("Cancelar"); await view.click("Cancelar exportação"); expect(cancel).toHaveBeenCalledTimes(1);
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível cancelar"); expect(close).not.toHaveBeenCalled();
});

it("FlowDialog conserva Escape, foco de retorno e navegação por Tab", async () => {
  const close = vi.fn();
  view = await reactHost(<FlowDialog open={false} title="Confirmar" onClose={close}>{null}</FlowDialog>, environment => {
    const focus = environment.HTMLElement.prototype.focus;
    environment.HTMLElement.prototype.focus = function () {
      if (!this.closest("dialog:not([open])")) focus.call(this);
    };
  });
  const trigger = document.createElement("button");
  view.host.prepend(trigger); trigger.focus();
  await view.render(<FlowDialog open title="Confirmar" onClose={close}><button type="button">Cancelar</button><button type="button">Confirmar</button></FlowDialog>);
  const dialog = view.host.querySelector("dialog")!; const last = button("Confirmar");
  await act(async () => { last.focus(); last.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(dialog.querySelector("button"));
  await act(async () => { dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })); }); expect(close).toHaveBeenCalledTimes(1);
  await view.render(<FlowDialog open={false} title="Confirmar" onClose={close}>{null}</FlowDialog>); expect(document.activeElement).toBe(trigger);
});
