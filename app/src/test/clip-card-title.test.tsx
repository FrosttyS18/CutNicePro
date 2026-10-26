import { act } from "react";
import { expect, it, vi } from "vitest";
import { ClipCard } from "../components/clips/ClipCard";
import type { LibraryClip } from "../lib/clip-library";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("../components/clips/ClipPoster", () => ({ ClipPoster: () => <span>Miniatura</span> }));

function entry(title: string): LibraryClip {
  return { project: { id: "project", name: "Projeto", created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null }, mediaId: "source",
    clip: { id: "a".repeat(64), start: 0, end: 30, title, review: "pending", score: null, reasons: [], manuallyEdited: true } };
}

it.each(["Título curto", "Edição com atenção à informação: por que decisões difíceis precisam de tempo?", "PalavraMuitoLongaSemEspaços".repeat(8)])("mantém título completo e abre inspeção usando tooltip próprio: %s", async title => {
  const current = entry(title);
  const inspect = vi.fn();
  const view = await reactHost(<ClipCard entry={current} workspace={emptyWorkspace()} now={0} onInspect={inspect}/>);
  const owner = view.host.ownerDocument;
  try {
    const button = view.host.querySelector<HTMLButtonElement>(".clip-card__title")!;
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    expect(button.textContent).toBe(title);
    expect(button.hasAttribute("title")).toBe(false);
    await act(async () => button.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true })));
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip?.textContent).toBe(title);
    expect(button.getAttribute("aria-describedby")).toBe(tooltip?.id);
    expect(tooltip?.classList.contains("editor-tooltip")).toBe(true);
    await act(async () => button.dispatchEvent(new window.MouseEvent("mouseout", { bubbles: true })));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => button.focus());
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(title);
    await act(async () => button.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    expect(document.activeElement).toBe(button);
    await act(async () => button.click());
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledWith(current);
  } finally { await view.close(); }
  expect(owner.querySelector('[role="tooltip"]')).toBeNull();
});

it("remove tooltip no blur e ao desmontar card enquanto está aberto", async () => {
  const view = await reactHost(<ClipCard entry={entry("Título completo")} workspace={emptyWorkspace()} now={0} onInspect={vi.fn()}/>);
  const owner = view.host.ownerDocument;
  const button = view.host.querySelector<HTMLButtonElement>(".clip-card__title")!;
  try {
    await act(async () => button.focus());
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    await act(async () => button.blur());
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => button.focus());
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  } finally { await view.close(); }
  expect(owner.querySelector('[role="tooltip"]')).toBeNull();
});
