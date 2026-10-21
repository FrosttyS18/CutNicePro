import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditHistoryCore } from "../lib/edit-history";

/**
 * Ponte React do EditHistoryCore: o hook mantém a versão do core e expõe
 * commit/undo/redo/canUndo/canRedo; o presente continua na fonte de dados
 * do workspace (sem duplicação). undo/redo aplicam o snapshot restaurado
 * pela callback registrada em `restore`.
 */
export function useEditHistory<T>(present: T, serialize: (value: T) => string, coalesceMs = 700) {
  const serialized = serialize(present);
  // core construído uma vez por mount: as dependências de serialização são
  // estáveis por contrato do editor (serialize vem de useCallback com [])
  // e coalesceMs é constante da sessão
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const core = useMemo(() => new EditHistoryCore<T>(serialize, serialized, coalesceMs), []);
  const presentRef = useRef(present);
  useEffect(() => {
    presentRef.current = present;
    // re-sincroniza o cursor quando a fonte muda sem commit (ex.: load
    // inicial ou transcrição aceita por fora do editor)
    core.sync(serialized);
  }, [core, present, serialized]);
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((value) => value + 1), []);

  const commit = useCallback(
    (next: T, group: string) => {
      core.commit(next, group);
      rerender();
    },
    [core, rerender],
  );

  const undo = useCallback(() => {
    core.undo(presentRef.current);
    rerender();
  }, [core, rerender]);

  const redo = useCallback(() => {
    core.redo(presentRef.current);
    rerender();
  }, [core, rerender]);

  const restore = useCallback((handler: (value: T) => void) => core.restore(handler), [core]);

  return { commit, undo, redo, restore, canUndo: core.canUndo, canRedo: core.canRedo };
}
