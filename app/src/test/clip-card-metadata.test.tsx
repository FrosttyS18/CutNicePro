import { expect, it, vi } from "vitest";
import { ClipCard } from "../components/clips/ClipCard";
import type { LibraryClip } from "../lib/clip-library";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("../components/clips/ClipPoster", () => ({ ClipPoster: () => <span>Miniatura</span> }));

const entry: LibraryClip = {
  project: { id: "project", name: "Projeto", created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null },
  mediaId: "source",
  clip: { id: "a".repeat(64), start: 0, end: 30, title: "Trecho", review: "pending", score: 95, reasons: [],
    analysis: { title: "Trecho", summary: "Resumo", criteria: [] } },
};

it.each([undefined, "manual"] as const)("identifica edição com tag literal sem nota, inclusive origem %s", async origin => {
  const edited = { ...entry, clip: { ...entry.clip, origin, manuallyEdited: true } };
  const before = JSON.stringify(edited);
  const view = await reactHost(<ClipCard entry={edited} workspace={emptyWorkspace()} now={0} onInspect={vi.fn()} onEdit={vi.fn()}/>);
  try {
    const meta = view.host.querySelector(".clip-card__meta")!;
    expect(meta.firstElementChild?.textContent).toBe("Editado");
    expect(meta.firstElementChild?.classList.contains("chip")).toBe(true);
    expect(meta.textContent).toBe("Editado");
    expect(meta.querySelector('[aria-label^="Nota estimada"]')).toBeNull();
    expect(meta.nextElementSibling?.textContent).toBe("Trecho");
    expect(view.host.querySelector('.clip-card__actions button[aria-label="Editar"] svg')).not.toBeNull();
    expect(JSON.stringify(edited)).toBe(before);
  } finally { await view.close(); }
});

it.each([0, 95])("mantém nota real e seu nome acessível: %s", async score => {
  const view = await reactHost(<ClipCard entry={{ ...entry, clip: { ...entry.clip, score } }} workspace={emptyWorkspace()} now={0} onInspect={vi.fn()}/>);
  try {
    const meta = view.host.querySelector(".clip-card__meta")!;
    const grade = meta.querySelector("strong")!;
    expect(grade.getAttribute("aria-label")).toBe(`Nota estimada: ${score} de 100`);
    expect(grade.textContent).toBe(`${score}/100`);
    expect(meta.nextElementSibling?.textContent).toBe("Trecho");
  } finally { await view.close(); }
});

it.each([
  { changes: { origin: "manual" as const }, label: "Manual" },
  { changes: { analysisError: "Falha" }, label: "Análise pendente" },
  { changes: { analysisStale: true }, label: "Análise desatualizada" },
  { changes: { analysis: undefined }, label: "Sem análise" },
])("preserva o estado de metadados $label sem inventar nota", async ({ changes, label }) => {
  const view = await reactHost(<ClipCard entry={{ ...entry, clip: { ...entry.clip, ...changes } }} workspace={emptyWorkspace()} now={0} onInspect={vi.fn()}/>);
  try {
    const meta = view.host.querySelector(".clip-card__meta")!;
    expect(meta.firstElementChild?.textContent).toBe(label);
    expect(meta.querySelector("strong")).toBeNull();
    expect(meta.nextElementSibling?.textContent).toBe("Trecho");
  } finally { await view.close(); }
});
