type Gate = { released: boolean; waiters: Set<() => void> };

const gate: Gate = { released: false, waiters: new Set() };

export function releaseIntroGate(): void {
  if (gate.released) return;
  gate.released = true;
  gate.waiters.forEach((w) => w());
  gate.waiters.clear();
}

export function introGateReleased(): boolean {
  return gate.released;
}

export function onIntroGateReady(cb: () => void): () => void {
  if (gate.released) {
    cb();
    return () => undefined;
  }
  gate.waiters.add(cb);
  return () => {
    gate.waiters.delete(cb);
  };
}
