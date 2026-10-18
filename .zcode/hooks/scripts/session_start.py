"""Hook SessionStart — registra o início da sessão no log de auditoria do projeto.

Sempre exit 0 (nunca bloqueia). No-op fora do workspace CutNicePro.
"""
import sys

from common import in_workspace, log_audit, read_stdin_json, session_id


def main() -> None:
    data = read_stdin_json()
    if not in_workspace(sys.argv):
        sys.exit(0)
    log_audit({
        "event": "SessionStart",
        "hook": "session_start",
        "session_id": session_id(),
        "source": str(data.get("source", ""))[:40],
    })
    sys.exit(0)


if __name__ == "__main__":
    main()
