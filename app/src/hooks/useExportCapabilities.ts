import { useEffect, useState } from "react";
import { getEditorExportCapabilities } from "../lib/ipc";
import { parseExportCapabilities, type ExportCapabilities } from "../lib/composition-export";

type State = { status: "loading" } | { status: "failed" } | { status: "ready"; capabilities: ExportCapabilities };

export function useExportCapabilities() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getEditorExportCapabilities().then(parseExportCapabilities).then((capabilities: ExportCapabilities) => {
      if (active) setState({ status: "ready", capabilities });
    }).catch(() => { if (active) setState({ status: "failed" }); });
    return () => { active = false; };
  }, [attempt]);
  function retry() { setState({ status: "loading" }); setAttempt(current => current + 1); }
  return { state, retry };
}
