import { requireComposition } from "./composition";
import { compositionContentKey, type CompositionBatchReceipt, type PreparedCompositionBatch, type PreparedRelatedClip, type RelatedClipDraft, type RecoveryClipDraft } from "./composition-batch";
import type { Composition } from "./composition-types";

export interface CompositionPersistence {
  save(document: Composition, expectedRevision: number): Promise<Composition>;
  saveBatch?(document: Composition, expectedRevision: number, related: RelatedClipDraft[], activeChanged: boolean): Promise<CompositionBatchReceipt>;
}
interface RelatedState { document: Composition; key: string }
interface State { document: Composition; key: string; related: Record<string, RelatedState> }
function relatedState(document: Composition): RelatedState { requireComposition(document); return { document, key: compositionContentKey(document) }; }
function state(document: Composition, related: State["related"] = {}): State { return { ...relatedState(document), related }; }
function same(a: State, b: State): boolean {
  return a.key === b.key && Object.keys(a.related).length === Object.keys(b.related).length && Object.entries(a.related).every(([id, value]) => value.key === b.related[id]?.key);
}
function hydrate(value: State, added: State["related"]): State { return { ...value, related: { ...added, ...value.related } }; }

export class CompositionSession {
  private present: State;
  private saved: State;
  private past: State[] = [];
  private future: State[] = [];
  private revisions: Record<string, number> = {};
  private recoveryCache: { current: State["related"]; saved: State["related"]; revisions: Record<string, number>; value: RecoveryClipDraft[] } | null = null;
  private inFlight: Promise<boolean> | null = null;
  error: string | null = null;
  constructor(document: Composition, private persistence: CompositionPersistence) { this.present = this.saved = state(structuredClone(document)); }
  get document(): Composition { return this.present.document; }
  get savedDocument(): Composition { return this.saved.document; }
  get dirty(): boolean { return !same(this.present, this.saved); }
  get saving(): boolean { return this.inFlight !== null; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get relatedDocuments(): PreparedRelatedClip[] {
    return Object.entries(this.present.related).map(([clipId, value]) => ({ clipId, document: value.document, expectedRevision: this.revisions[clipId], baseDocument: this.saved.related[clipId].document }));
  }
  get relatedDrafts(): RelatedClipDraft[] { return this.pending(this.present); }
  get recoveryRelated(): RecoveryClipDraft[] {
    if (this.recoveryCache?.current === this.present.related && this.recoveryCache.saved === this.saved.related && this.recoveryCache.revisions === this.revisions) return this.recoveryCache.value;
    const value = this.pending(this.present).map(draft => ({ ...draft, baseDocument: this.saved.related[draft.clipId].document }));
    this.recoveryCache = { current: this.present.related, saved: this.saved.related, revisions: this.revisions, value };
    return value;
  }
  private pending(value: State): RelatedClipDraft[] {
    return Object.entries(value.related).filter(([id, entry]) => entry.key !== this.saved.related[id]?.key)
      .map(([clipId, entry]) => ({ clipId, document: entry.document, expectedRevision: this.revisions[clipId] }));
  }
  private commit(next: State): void {
    if (same(next, this.present)) return;
    this.past = [...this.past.slice(-99), this.present]; this.present = next; this.future = []; this.error = null;
  }
  apply(document: Composition): void { this.commit(state(document, this.present.related)); }
  applyBatch(batch: PreparedCompositionBatch): void {
    const documentState = relatedState(batch.document);
    const added: State["related"] = {}, changed: State["related"] = {};
    const ids = new Set<string>();
    for (const draft of batch.related) {
      if (!/^[a-f\d]{64}$/i.test(draft.clipId) || ids.has(draft.clipId) || !Number.isSafeInteger(draft.expectedRevision) || draft.expectedRevision < 0) throw new Error("Alvo inválido no lote.");
      ids.add(draft.clipId);
      if (this.revisions[draft.clipId] !== undefined && this.revisions[draft.clipId] !== draft.expectedRevision) throw new Error("Um corte foi atualizado em outra sessão. Reabra antes de aplicar o estilo.");
      const baseline = relatedState(draft.baseDocument);
      changed[draft.clipId] = relatedState(draft.document);
      if (!this.saved.related[draft.clipId]) added[draft.clipId] = baseline;
    }
    this.saved = hydrate(this.saved, added); this.present = hydrate(this.present, added);
    this.past = this.past.map(value => hydrate(value, added)); this.future = this.future.map(value => hydrate(value, added));
    for (const draft of batch.related) this.revisions[draft.clipId] = draft.expectedRevision;
    this.commit({ ...documentState, related: { ...this.present.related, ...changed } });
  }
  undo(): void { const previous = this.past.pop(); if (previous) { this.future.push(this.present); this.present = previous; this.error = null; } }
  redo(): void { const next = this.future.pop(); if (next) { this.past.push(this.present); this.present = next; this.error = null; } }
  discard(): void { this.present = this.saved; this.past = []; this.future = []; this.error = null; }
  restoreRecovery(document: Composition, baseRevision: number, related: RecoveryClipDraft[] = []): void {
    if (baseRevision !== this.saved.document.revision) throw new Error("A recuperação pertence a outra versão salva");
    if (related.length) {
      const drafts = related.map(draft => { if (!draft.baseDocument) throw new Error("A recuperação do lote não tem sua versão original."); return { ...draft, baseDocument: draft.baseDocument }; });
      this.applyBatch({ document, related: drafts });
    } else this.apply(document);
  }
  save(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    if (!this.dirty) return Promise.resolve(true);
    const promise = this.persist(this.present); this.inFlight = promise;
    void promise.then(() => { this.inFlight = null; }); return promise;
  }
  private async persist(captured: State): Promise<boolean> {
    this.error = null;
    const revision = this.saved.document.revision;
    const related = this.pending(captured), activeChanged = captured.key !== this.saved.key;
    try {
      let document: Composition;
      const savedRelated = { ...captured.related }, nextRevisions = { ...this.revisions };
      if (related.length) {
        if (!this.persistence.saveBatch) throw new Error("O salvamento em lote não está disponível.");
        const receipt = await this.persistence.saveBatch(captured.document, revision, related, activeChanged);
        if (activeChanged ? !receipt.document || receipt.document.revision !== revision + 1 || compositionContentKey(receipt.document) !== captured.key : receipt.document !== null) throw new Error("A confirmação do lote não corresponde à edição enviada");
        if (Object.keys(receipt.related).length !== related.length) throw new Error("A confirmação do lote está incompleta");
        for (const draft of related) {
          const received = receipt.related[draft.clipId];
          if (!received || received.revision !== draft.expectedRevision + 1 || relatedState(received).key !== captured.related[draft.clipId].key) throw new Error("A confirmação de um corte não corresponde ao lote enviado");
          nextRevisions[draft.clipId] = received.revision;
          savedRelated[draft.clipId] = { ...captured.related[draft.clipId], document: { ...draft.document, revision: received.revision } };
        }
        document = activeChanged ? { ...captured.document, revision: receipt.document!.revision } : this.saved.document;
      } else {
        const received = state(await this.persistence.save(captured.document, revision));
        if (received.document.revision !== revision + 1 || received.key !== captured.key) throw new Error("A confirmação de salvamento não corresponde à edição enviada");
        document = { ...captured.document, revision: received.document.revision };
      }
      const saved = { document, key: captured.key, related: { ...this.saved.related, ...savedRelated } };
      this.saved = saved; this.revisions = { ...this.revisions, ...nextRevisions };
      if (same(this.present, captured)) this.present = saved;
      return true;
    } catch (error) { this.error = error instanceof Error ? error.message : typeof error === "string" && error.trim() ? error : "Não foi possível salvar a edição"; return false; }
  }
}
