/**
 * Núcleo puro do histórico de edição: desfazer/refazer com agrupamento de
 * interações contínuas (coalescimento por grupo + janela de tempo —
 * comportamento estudado no use-editor.ts do SupoClip; implementação
 * própria). Snapshots são strings serializadas (máx. 50 por pilha); o
 * presente vive na fonte de dados do workspace — sem duplicar estado.
 */
export class EditHistoryCore<T> {
  private past: string[] = [];
  private future: string[] = [];
  private cursor: string;
  private lastGroup = "";
  private lastAt = 0;
  private onRestore: ((value: T) => void) | null = null;

  constructor(
    private serialize: (value: T) => string,
    cursorInicial: string,
    private coalesceMs = 700,
    private limit = 50,
  ) {
    this.cursor = cursorInicial;
  }

  /** Registra o estado atual como nova edição (grupo vazio nunca coalesce). */
  commit(present: T, group = ""): void {
    const serialized = this.serialize(present);
    if (serialized === this.cursor) return;
    const now = Date.now();
    const coalesce = group !== "" && this.lastGroup === group && now - this.lastAt < this.coalesceMs;
    this.lastGroup = group;
    this.lastAt = now;
    if (!coalesce) this.past = [...this.past, this.cursor].slice(-this.limit);
    this.cursor = serialized;
    this.future = [];
  }

  /** Re-sincroniza o cursor quando a fonte muda sem commit (load inicial). */
  sync(serialized: string): void {
    this.cursor = serialized;
  }

  undo(present: T): boolean {
    if (!this.past.length) return false;
    const snapshot = this.past[this.past.length - 1];
    const restored = this.parse(snapshot);
    if (restored === undefined) return false;
    this.future = [this.serialize(present), ...this.future].slice(0, this.limit);
    this.past = this.past.slice(0, -1);
    this.cursor = snapshot;
    this.lastGroup = "";
    this.onRestore?.(restored);
    return true;
  }

  redo(present: T): boolean {
    if (!this.future.length) return false;
    const snapshot = this.future[0];
    const restored = this.parse(snapshot);
    if (restored === undefined) return false;
    this.past = [...this.past, this.serialize(present)].slice(-this.limit);
    this.future = this.future.slice(1);
    this.cursor = snapshot;
    this.lastGroup = "";
    this.onRestore?.(restored);
    return true;
  }

  restore(handler: (value: T) => void): void {
    this.onRestore = handler;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  private parse(snapshot: string): T | undefined {
    try {
      return JSON.parse(snapshot) as T;
    } catch {
      return undefined;
    }
  }
}
