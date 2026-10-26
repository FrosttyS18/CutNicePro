import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorAction } from "../components/editor/EditorAction";
import { EditorMenu } from "../components/editor/EditorMenu";
import { reactHost } from "./react-host";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });

describe("controles do design system do editor", () => {
  it("usa tooltip próprio com texto e atalho, sem title do navegador", async () => {
    mounted = await reactHost(<EditorAction label="Dividir" tooltip="Dividir no cursor · Ctrl+B" icon={<span />} onClick={() => undefined} />);
    const button = mounted.host.querySelector("button")!;
    expect(button.hasAttribute("title")).toBe(false);
    await act(async () => { button.focus(); });
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Dividir no cursor · Ctrl+B");
  });

  it("ação indisponível informa o motivo e não executa o comando", async () => {
    const action = vi.fn();
    mounted = await reactHost(<EditorAction label="Dividir" tooltip="Selecione um item" icon={<span />} disabled onClick={action} />);
    await mounted.click("Dividir");
    expect(action).not.toHaveBeenCalled();
    expect(mounted.host.querySelector("button")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("menu suporta teclado, ícones e fecha após executar uma opção", async () => {
    const action = vi.fn();
    const close = vi.fn();
    mounted = await reactHost(<EditorMenu label="Ações do trecho" x={20} y={20} onClose={close}
      items={[{ label: "Duplicar", icon: <span />, shortcut: "Ctrl+D", onSelect: action },
        { label: "Excluir", icon: <span />, disabled: true, onSelect: () => undefined },
        { label: "Copiar", icon: <span />, onSelect: () => undefined }]} />);
    const menu = document.querySelector('[role="menu"]')!;
    const option = menu.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    expect(option.textContent).toContain("Ctrl+D");
    await act(async () => { menu.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    expect(document.activeElement?.textContent).toContain("Copiar");
    await act(async () => { menu.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
    expect(document.activeElement).toBe(option);
    await act(async () => { option.click(); });
    expect(action).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
