import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { emptyWorkspace } from "../lib/workspace";
import { ProjectWorkspace } from "../screens/ProjectWorkspace";
import { reactHost } from "./react-host";

const reloadClips = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useWorkspaceData", () => ({
  useWorkspaceData: () => ({ data: emptyWorkspace(), dirty: false, notice: null }),
}));
vi.mock("../hooks/useTranscription", () => ({ useTranscription: () => ({ busy: false }) }));
vi.mock("../hooks/useClips", () => ({
  useClips: () => ({ busy: false, loading: false, collection: null, reload: reloadClips }),
}));
vi.mock("../components/editor/VideoEditor", () => ({
  VideoEditor: ({ onBack, onShowClips }: { onBack: () => void; onShowClips?: () => void }) => <section aria-label="Editor de teste">
    <button type="button" onClick={onBack}>Voltar ao projeto</button>
    <button type="button" onClick={onShowClips}>Ir para clipes</button>
  </section>,
}));
vi.mock("../components/workspace/ProjectDeleteButton", () => ({ ProjectDeleteButton: () => null }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });

it("abre o editor pela rota e permite voltar sem remontar o projeto", async () => {
  function Navigation() {
    const [route, setRoute] = useState<"overview" | "editor">("overview");
    return <>
      <button type="button" onClick={() => setRoute("editor")}>Abrir pela rota</button>
      <button type="button" onClick={() => setRoute("overview")}>Limpar rota</button>
      <ProjectWorkspace project={{ id: "p", name: "Projeto", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }}
        initialView={route} onRename={async () => {}} onImport={() => {}} onDelete={async () => {}} />
    </>;
  }
  mounted = await reactHost(<Navigation />);
  expect(mounted.host.textContent).toContain("Este projeto não tem um vídeo.");
  await mounted.click("Abrir pela rota");
  expect(mounted.host.querySelector('[aria-label="Editor de teste"]')).not.toBeNull();
  await mounted.click("Voltar ao projeto");
  expect(mounted.host.textContent).toContain("Este projeto não tem um vídeo.");
  await mounted.click("Limpar rota");
  await mounted.click("Abrir pela rota");
  expect(mounted.host.querySelector('[aria-label="Editor de teste"]')).not.toBeNull();
});

it("Ir para clipes recarrega e abre somente a coleção do projeto atual", async () => {
  mounted = await reactHost(<ProjectWorkspace project={{ id: "p", name: "Projeto atual", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }}
    initialView="editor" onRename={async () => {}} onImport={() => {}} onDelete={async () => {}} />);
  await mounted.click("Ir para clipes");
  expect(reloadClips).toHaveBeenCalledTimes(1);
  expect(mounted.host.querySelector('[aria-label="Editor de teste"]')).toBeNull();
  expect(mounted.host.querySelector(".project-clips__heading h1")?.textContent).toBe("Projeto atual");
});
