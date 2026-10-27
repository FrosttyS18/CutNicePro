import { act } from "react";
import { expect, it, vi } from "vitest";
import { EditorAction } from "../components/editor/EditorAction";
import { reactHost } from "./react-host";

it.each([false, true])("preserva hover, foco, Escape e descarte com disabled=%s", async disabled => {
  const action = vi.fn();
  const view = await reactHost(<EditorAction compact label="Executar" tooltip="Descrição completa" icon={<span aria-hidden="true">Ícone</span>} pressed disabled={disabled} onClick={action}/>);
  const owner = view.host.ownerDocument;
  try {
    const anchor = view.host.querySelector<HTMLElement>(".editor-action")!;
    const button = anchor.querySelector("button")!;
    expect(button.classList.contains("editor-action__button--compact")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Executar");
    expect(button.getAttribute("aria-disabled")).toBe(String(disabled));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("title")).toBe(false);
    await act(async () => anchor.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true })));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Descrição completa");
    expect(document.querySelector('[role="tooltip"]')?.parentElement).toBe(document.body);
    expect(button.getAttribute("aria-describedby")).toBe(document.querySelector('[role="tooltip"]')?.id);
    await act(async () => anchor.dispatchEvent(new window.MouseEvent("mouseout", { bubbles: true })));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => button.focus());
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Descrição completa");
    await act(async () => button.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(document.activeElement).toBe(button);
    await act(async () => { button.blur(); button.focus(); });
    await act(async () => button.click());
    expect(action).toHaveBeenCalledTimes(disabled ? 0 : 1);
    expect(Boolean(document.querySelector('[role="tooltip"]'))).toBe(disabled);
    await act(async () => button.blur());
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => button.focus());
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  } finally { await view.close(); }
  expect(owner.querySelector('[role="tooltip"]')).toBeNull();
});
