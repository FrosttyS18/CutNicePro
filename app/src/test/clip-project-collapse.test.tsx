import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ClipGallery } from "../components/clips/ClipGallery";
import { emptyWorkspace } from "../lib/workspace";
import type { LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";

vi.mock("../services/workspace-store", () => ({ readWorkspace: () => emptyWorkspace() }));
vi.mock("../components/clips/ClipCard", () => ({ ClipCard: ({ entry }: { entry: LibraryClip }) => <button type="button">{entry.clip.title}</button> }));

const entries: LibraryClip[] = ["A", "B"].map((name, index) => ({
  project: { id: name, name: `Projeto ${name}`, created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null }, mediaId: name,
  clip: { id: String(index).repeat(64), start: 0, end: 10, title: `Clipe ${name}`, review: "pending", score: 80, reasons: [] },
}));
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; });
async function clickToggle(label: string) {
  const button = Array.from(view!.host.querySelectorAll("button")).find(value => value.getAttribute("aria-label") === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

it("recolhe e expande cada projeto sem alterar os demais nem a contagem", async () => {
  view = await reactHost(<ClipGallery entries={entries} showProject onInspect={vi.fn()}/>);
  const toggle = view.host.querySelector<HTMLButtonElement>('[aria-label="Recolher clipes de Projeto A"]');
  expect(toggle).not.toBeNull();
  expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  await clickToggle("Recolher clipes de Projeto A");
  expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  const content = view.host.ownerDocument.getElementById(toggle!.getAttribute("aria-controls")!);
  expect(content?.hasAttribute("hidden")).toBe(true);
  expect(content?.textContent).toBe("");
  expect(view.host.textContent).toContain("Clipe B");
  expect(view.host.querySelector("h2")?.textContent).toBe("2 clipes");
  await clickToggle("Recolher clipes de Projeto B");
  expect(view.host.textContent).not.toContain("Clipe B");
  await clickToggle("Expandir clipes de Projeto A");
  expect(view.host.textContent).toContain("Clipe A");
  expect(view.host.textContent).not.toContain("Clipe B");
});

it("mantém o recolhimento por identidade ao atualizar a coleção", async () => {
  const render = (values: LibraryClip[]) => <ClipGallery entries={values} showProject onInspect={vi.fn()}/>;
  view = await reactHost(render(entries));
  await clickToggle("Recolher clipes de Projeto A");
  await view.render(render(entries.map(value => ({ ...value, clip: { ...value.clip, title: `${value.clip.title} atualizado` } }))));
  expect(view.host.querySelector('[aria-label="Expandir clipes de Projeto A"]')?.getAttribute("aria-expanded")).toBe("false");
  expect(view.host.textContent).not.toContain("Clipe A atualizado");
  expect(view.host.textContent).toContain("Clipe B atualizado");
});

it("a galeria de um único projeto mantém a apresentação atual sem recolhedor", async () => {
  view = await reactHost(<ClipGallery entries={entries.slice(0, 1)} onInspect={vi.fn()}/>);
  expect(view.host.querySelector('.clip-project-group__toggle')).toBeNull();
  expect(view.host.textContent).toContain("Clipe A");
});
