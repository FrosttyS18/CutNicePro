import { act } from "react";
import { expect, it, vi } from "vitest";
import { ClipCard } from "../components/clips/ClipCard";
import type { LibraryClip } from "../lib/clip-library";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("../components/clips/ClipPoster", () => ({ ClipPoster: () => <span>Miniatura</span> }));

const entry: LibraryClip = {
  project: { id: "project", name: "Projeto", created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null },
  mediaId: "source",
  clip: { id: "a".repeat(64), start: 0, end: 30, title: "Trecho", review: "pending", score: 80, reasons: [] },
};

it("mantém ações identificáveis por teclado e tooltip próprio sem rótulos visuais grandes", async () => {
  const inspect = vi.fn(), edit = vi.fn(), download = vi.fn(), remove = vi.fn();
  const view = await reactHost(<ClipCard entry={entry} workspace={emptyWorkspace()} now={0} onInspect={inspect} onEdit={edit} onDownload={download} onDelete={remove}/>);
  try {
    const buttons = [...view.host.querySelectorAll<HTMLButtonElement>(".clip-card__actions button")];
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["Editar", "Baixar", "Excluir"]);
    for (const [index, label] of ["Editar", "Baixar", "Excluir"].entries()) {
      const button = buttons[index];
      expect(button.querySelector("svg")).not.toBeNull();
      expect(button.querySelector(".sr-only")?.textContent).toBe(label);
      expect(button.hasAttribute("title")).toBe(false);
      await act(async () => button.focus());
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(`${label} clipe`);
      expect(button.getAttribute("aria-describedby")).toBe(document.querySelector('[role="tooltip"]')?.id);
      await act(async () => button.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
      await act(async () => button.click());
    }
    expect(edit).toHaveBeenCalledTimes(1); expect(edit).toHaveBeenCalledWith(entry);
    expect(download).toHaveBeenCalledTimes(1); expect(download).toHaveBeenCalledWith(entry);
    expect(remove).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith(entry);
    expect(inspect).not.toHaveBeenCalled();
  } finally { await view.close(); }
});

it("clipe excluído oferece só restauração com o mesmo padrão de ícone e nome acessível", async () => {
  const deleted = { ...entry, clip: { ...entry.clip, deleted: true } };
  const restore = vi.fn();
  const view = await reactHost(<ClipCard entry={deleted} workspace={emptyWorkspace()} now={0} onInspect={vi.fn()} onEdit={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()} onRestore={restore}/>);
  try {
    const buttons = view.host.querySelectorAll<HTMLButtonElement>(".clip-card__actions button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("Restaurar");
    expect(buttons[0].querySelector("svg")).not.toBeNull();
    expect(buttons[0].querySelector(".sr-only")?.textContent).toBe("Restaurar");
    await act(async () => buttons[0].click());
    expect(restore).toHaveBeenCalledTimes(1); expect(restore).toHaveBeenCalledWith(deleted);
  } finally { await view.close(); }
});
