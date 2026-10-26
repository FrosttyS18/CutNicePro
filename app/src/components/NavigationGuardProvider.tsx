import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { NavigationGuard } from "../lib/navigation-guard";
import { NavigationGuardContext } from "../hooks/useNavigationGuard";
import { FlowDialog } from "./workspace/FlowDialog";
import "./navigation-guard.css";

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [guard] = useState(() => new NavigationGuard());
  const state = useSyncExternalStore(guard.subscribe, guard.getSnapshot, guard.getSnapshot);
  useEffect(() => () => guard.dispose(), [guard]);
  return <NavigationGuardContext value={guard}>
    {children}
    <FlowDialog open={state.open} title="Salvar alterações antes de sair?" busy={state.busy} onClose={guard.cancel}>
      <p>Seu rascunho ainda não foi confirmado.</p>
      {state.error && <p role="alert">{state.error}</p>}
      <div className="unsaved-navigation__actions">
        <button type="button" className="flow-button" disabled={state.busy} onClick={guard.cancel}>Continuar editando</button>
        <button type="button" className="flow-button" disabled={state.busy} onClick={() => void guard.confirm("discard")}>Descartar e sair</button>
        <button type="button" className="flow-button" disabled={state.busy} onClick={() => void guard.confirm("save")}>{state.busy ? "Aguarde…" : "Salvar e sair"}</button>
      </div>
    </FlowDialog>
  </NavigationGuardContext>;
}
