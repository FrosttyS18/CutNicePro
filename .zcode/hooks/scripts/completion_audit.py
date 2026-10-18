"""Hook Stop — auditoria de conclusão de resposta no workspace CutNicePro.

Executa a baseline em MODO FAST (apenas checks estruturais, suítes de teste ficam
SKIP — a validação completa "baseline_checks.py --full" deve ser executada
explicitamente antes de concluir implementações relevantes) e registra o resultado
com duração no log de auditoria. NUNCA bloqueia nem pede continuação (exit 0
sempre), para evitar loops de Stop. No-op fora do workspace.
"""
import json
import os
import subprocess
import sys
import time

from common import PROJECT_ROOT, in_workspace, log_audit, session_id

HARNESS = os.path.join(PROJECT_ROOT, ".zcode", "hooks", "harness", "baseline_checks.py")


def main() -> None:
    if not in_workspace(sys.argv):
        sys.exit(0)

    t0 = time.monotonic()
    summary = {"status": "ERROR", "passed": 0, "failed": 0, "skipped": 0}
    try:
        proc = subprocess.run(
            [sys.executable, HARNESS, "--fast"],
            capture_output=True, text=True, timeout=80,
            cwd=PROJECT_ROOT,
        )
        out = (proc.stdout or "").strip()
        # a baseline imprime JSON na última linha
        for line in reversed(out.splitlines()):
            line = line.strip()
            if line.startswith("{"):
                summary = json.loads(line)
                break
        else:
            summary = {"status": "ERROR", "detail": (proc.stderr or out)[:300]}
    except Exception as exc:  # noqa: BLE001 — auditoria nunca derruba o Stop
        summary = {"status": "ERROR", "detail": str(exc)[:300]}

    duration_s = round(time.monotonic() - t0, 2)
    log_audit({
        "event": "Stop",
        "hook": "completion_audit",
        "session_id": session_id(),
        "mode": "fast",
        "duration_s": duration_s,
        "baseline": {
            "status": summary.get("status"),
            "passed": summary.get("passed"),
            "failed": summary.get("failed"),
            "skipped": summary.get("skipped"),
        },
    })
    sys.exit(0)


if __name__ == "__main__":
    main()
