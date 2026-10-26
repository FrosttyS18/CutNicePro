interface ReadySource { ready: boolean; hold?: () => void }

export class CompositionReadiness {
  private expected = new Set<string>();
  private sources = new Map<string, ReadySource>();
  private active = true;
  private previous: boolean | undefined;
  private buffered = false;
  private listeners = new Set<() => void>();
  private onChange: ((ready: boolean) => void) | undefined;

  listen(onChange?: (ready: boolean) => void): void { this.onChange = onChange; this.previous = undefined; }
  getSnapshot = (): boolean => this.buffered;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  expect(keys: string[]): void {
    const next = new Set(keys);
    if (next.size === this.expected.size && [...next].every(key => this.expected.has(key))) return;
    this.expected = next;
    for (const [key, source] of this.sources) if (!next.has(key)) { source.hold?.(); this.sources.delete(key); }
    this.publish();
  }
  activate(): void { this.active = true; this.publish(); }
  deactivate(): void { this.active = false; }

  observe(key: string, hold?: () => void): { report: (ready: boolean) => void; release: () => void } {
    const source: ReadySource = { ready: false, hold };
    this.sources.set(key, source);
    this.publish();
    return {
      report: ready => {
        if (this.sources.get(key) !== source || !this.expected.has(key)) return;
        source.ready = ready;
        this.publish();
      },
      release: () => { if (this.sources.get(key) === source) this.sources.delete(key); },
    };
  }

  private publish(): void {
    if (!this.active) return;
    const ready = [...this.expected].every(key => this.sources.get(key)?.ready === true);
    if (!ready) this.sources.forEach(source => source.hold?.());
    if (ready !== this.buffered) { this.buffered = ready; this.listeners.forEach(listener => listener()); }
    if (ready === this.previous) return;
    this.previous = ready;
    this.onChange?.(ready);
  }
}
