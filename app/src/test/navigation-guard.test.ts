import { describe, expect, it, vi } from "vitest";
import { NavigationGuard, type UnsavedWork } from "../lib/navigation-guard";

function fixture() {
  const guard = new NavigationGuard();
  const state = { dirty: true, saves: 0, discards: 0, pauses: 0, destination: "editor" };
  const source: UnsavedWork = {
    hasUnsavedChanges: () => state.dirty,
    save: async () => { state.saves++; state.dirty = false; return true; },
    discard: async () => { state.discards++; state.dirty = false; return true; },
    onPause: () => { state.pauses++; },
  };
  const unregister = guard.register(source);
  return { guard, state, source, unregister };
}

describe("guard de saída reutilizável", () => {
  it("continua diretamente quando não há alterações", async () => {
    const { guard, state } = fixture();
    state.dirty = false;
    expect(await guard.requestNavigation(() => { state.destination = "home"; })).toBe(true);
    expect(state.destination).toBe("home");
    expect(state.saves).toBe(0);
    expect(guard.getSnapshot().open).toBe(false);
  });

  it("continuar cancela somente a navegação e preserva o trabalho", async () => {
    const { guard, state } = fixture();
    const request = guard.requestNavigation(() => { state.destination = "home"; });
    expect(state.pauses).toBe(1);
    guard.cancel();
    expect(await request).toBe(false);
    expect(state).toMatchObject({ dirty: true, saves: 0, discards: 0, destination: "editor" });
  });

  it("mantém o primeiro destino e não cria uma segunda confirmação", async () => {
    const { guard, state } = fixture();
    const first = guard.requestNavigation(() => { state.destination = "home"; });
    expect(await guard.requestNavigation(() => { state.destination = "projects"; })).toBe(false);
    await guard.confirm("save");
    expect(await first).toBe(true);
    expect(state.destination).toBe("home");
    expect(state.saves).toBe(1);
  });

  it("não deixa sair quando surgiu uma nova edição durante o salvamento", async () => {
    const { guard, state, source } = fixture();
    source.save = async () => { state.saves++; return true; };
    const request = guard.requestNavigation(() => { state.destination = "home"; });
    await guard.confirm("save");
    expect(state.destination).toBe("editor");
    expect(guard.getSnapshot()).toMatchObject({ open: true, busy: false, error: expect.stringMatching(/alterações novas/i) });
    guard.cancel();
    expect(await request).toBe(false);
  });

  it("não descarta o estado nem navega se a limpeza da recuperação falhou", async () => {
    const { guard, state, source } = fixture();
    source.discard = async () => false;
    const request = guard.requestNavigation(() => { state.destination = "home"; });
    await guard.confirm("discard");
    expect(state).toMatchObject({ destination: "editor", dirty: true });
    expect(guard.getSnapshot()).toMatchObject({ open: true, busy: false, error: expect.stringMatching(/descartar/i) });
    guard.cancel();
    expect(await request).toBe(false);
  });

  it("não repete um salvamento em andamento", async () => {
    const { guard, state, source } = fixture();
    let finish!: () => void;
    source.save = async () => {
      state.saves++;
      await new Promise<void>(resolve => { finish = resolve; });
      state.dirty = false;
      return true;
    };
    const request = guard.requestNavigation(() => { state.destination = "home"; });
    const saving = guard.confirm("save");
    await guard.confirm("save");
    guard.cancel();
    expect(state.saves).toBe(1);
    expect(guard.getSnapshot().busy).toBe(true);
    finish();
    await saving;
    expect(await request).toBe(true);
    expect(state.destination).toBe("home");
  });

  it("descarta respostas atrasadas quando o editor participante sai do contexto", async () => {
    const { guard, state, source, unregister } = fixture();
    let finish!: () => void;
    source.save = async () => { await new Promise<void>(resolve => { finish = resolve; }); state.dirty = false; return true; };
    const request = guard.requestNavigation(() => { state.destination = "home"; });
    const saving = guard.confirm("save");
    unregister();
    expect(await request).toBe(false);
    finish();
    await saving;
    expect(state.destination).toBe("editor");
    expect(guard.getSnapshot().open).toBe(false);
  });

  it("libera assinantes e navegação pendente ao desmontar", async () => {
    const { guard } = fixture();
    const listener = vi.fn();
    guard.subscribe(listener);
    const request = guard.requestNavigation(() => undefined);
    guard.dispose();
    expect(await request).toBe(false);
    expect(guard.hasUnsavedChanges()).toBe(false);
    expect(guard.getSnapshot().open).toBe(false);
  });
});
