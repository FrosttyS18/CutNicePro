import { Component, type ErrorInfo, type ReactNode } from "react";
import "./editor-opening.css";

interface OpeningProps {
  onBack: () => void;
  backLabel: string;
}

function OpeningState({ failed, onBack, backLabel }: OpeningProps & { failed: boolean }) {
  return <section className="editor-opening" aria-label="Abertura do editor">
    <div role={failed ? "alert" : "status"}>
      <h1>{failed ? "Não foi possível abrir o editor" : "Abrindo editor…"}</h1>
      <p>{failed ? "Volte para continuar no projeto. O conteúdo salvo foi preservado." : "Aguarde o carregamento das ferramentas de edição."}</p>
      {!failed && <progress aria-label="Carregando ferramentas de edição" />}
    </div>
    <button type="button" className="flow-button" onClick={onBack}>{backLabel}</button>
  </section>;
}

export function EditorLoading(props: OpeningProps) {
  return <OpeningState {...props} failed={false} />;
}

export class EditorOpenBoundary extends Component<OpeningProps & { children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const type = error instanceof TypeError ? "TypeError" : error instanceof ReferenceError ? "ReferenceError" : error instanceof SyntaxError ? "SyntaxError" : "Error";
    const components = info.componentStack?.split("\n").map(line => line.match(/^\s*at ([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1]).filter(Boolean).slice(0, 8);
    console.error("[editor] Falha na abertura ou execução do editor.", { type, components });
  }

  render() {
    return this.state.failed ? <OpeningState onBack={this.props.onBack} backLabel={this.props.backLabel} failed /> : this.props.children;
  }
}
