export interface UnsavedWork {
  hasUnsavedChanges: () => boolean;
  save: () => Promise<boolean>;
  discard: () => Promise<boolean | void>;
  onPause?: () => void;
}

export interface NavigationGuardState { open: boolean; busy: boolean; error: string | null }
interface PendingNavigation {
  sources: UnsavedWork[];
  action: () => void | Promise<void>;
  resolve: (allowed: boolean) => void;
  executing: boolean;
}

export class NavigationGuard {
  private sources = new Set<UnsavedWork>();
  private listeners = new Set<() => void>();
  private pending: PendingNavigation | null = null;
  private state: NavigationGuardState = { open: false, busy: false, error: null };

  getSnapshot = (): NavigationGuardState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  register = (source: UnsavedWork): (() => void) => {
    this.sources.add(source);
    return () => {
      this.sources.delete(source);
      if (this.pending?.sources.includes(source) && !this.pending.executing) this.finish(this.pending, false);
    };
  };
  hasUnsavedChanges = (): boolean => this.pending !== null || [...this.sources].some(source => source.hasUnsavedChanges());

  requestNavigation = async (action: () => void | Promise<void>): Promise<boolean> => {
    if (this.pending) return false;
    const sources = [...this.sources].filter(source => source.hasUnsavedChanges());
    if (!sources.length) { await action(); return true; }
    sources.forEach(source => source.onPause?.());
    return new Promise<boolean>(resolve => {
      this.pending = { sources, action, resolve, executing: false };
      this.update({ open: true, busy: false, error: null });
    });
  };

  cancel = (): void => {
    if (this.pending && !this.state.busy) this.finish(this.pending, false);
  };

  confirm = async (decision: "save" | "discard"): Promise<void> => {
    const pending = this.pending;
    if (!pending || this.state.busy) return;
    this.update({ open: true, busy: true, error: null });
    try {
      for (const source of pending.sources) {
        if (!source.hasUnsavedChanges()) continue;
        const result = decision === "save" ? await source.save() : await source.discard();
        if (this.pending !== pending) return;
        if (result === false) throw new Error(decision === "save"
          ? "Não foi possível salvar as alterações. Tente novamente ou continue editando."
          : "Não foi possível descartar as alterações. Tente novamente ou continue editando.");
      }
      if (pending.sources.some(source => source.hasUnsavedChanges())) {
        throw new Error("Há alterações novas no rascunho. Salve novamente antes de sair.");
      }
      pending.executing = true;
      await pending.action();
      if (this.pending === pending) this.finish(pending, true);
    } catch (error) {
      if (this.pending === pending) {
        pending.executing = false;
        this.update({ open: true, busy: false, error: error instanceof Error ? error.message : "Não foi possível concluir a saída. Continue editando e tente novamente." });
      }
    }
  };

  dispose = (): void => {
    if (this.pending) this.finish(this.pending, false);
    this.sources.clear();
    this.listeners.clear();
  };

  private update(state: NavigationGuardState): void {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  private finish(pending: PendingNavigation, allowed: boolean): void {
    this.pending = null;
    this.update({ open: false, busy: false, error: null });
    pending.resolve(allowed);
  }
}
