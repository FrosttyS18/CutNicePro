"""Utilidades comuns dos hooks do CutNicePro.

Os hooks são configurados no escopo USER do ZCode (~/.zcode/cli/config.json) e invocam
estes scripts, que ficam versionados no repositório do projeto. Todo script só age quando
a sessão pertence ao workspace C:\\CutNicePro (identificação por ${ZCODE_PROJECT_DIR});
em outros projetos eles terminam em silêncio (exit 0), sem interferência.
"""
import datetime
import json
import os
import sys

PROJECT_ROOT = r"C:\CutNicePro"
AUDIT_DIR = os.path.join(PROJECT_ROOT, ".zcode", "hooks", "audit")


def _norm(path: str) -> str:
    try:
        return os.path.normcase(os.path.normpath(os.path.abspath(path)))
    except Exception:
        return ""


def in_workspace(argv) -> bool:
    """True somente quando a sessão aponta para o workspace do CutNicePro."""
    candidates = []
    if len(argv) > 1 and argv[1]:
        candidates.append(argv[1])
    for var in ("ZCODE_PROJECT_DIR", "CLAUDE_PROJECT_DIR"):
        if os.environ.get(var):
            candidates.append(os.environ[var])
    root = _norm(PROJECT_ROOT)
    return any(_norm(c) == root for c in candidates)


def read_stdin_json() -> dict:
    """Lê o payload JSON do evento; em caso de entrada inesperada, devolve {} (fail-open)."""
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def session_id() -> str:
    return os.environ.get("ZCODE_SESSION_ID") or os.environ.get("CLAUDE_SESSION_ID") or ""


def log_audit(entry: dict) -> None:
    """Anexa uma entrada ao log de auditoria do projeto (runtime, gitignored)."""
    try:
        os.makedirs(AUDIT_DIR, exist_ok=True)
        record = {"ts": datetime.datetime.now().isoformat(timespec="seconds"), **entry}
        with open(os.path.join(AUDIT_DIR, "audit-log.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        # Auditoria nunca deve derrubar o hook.
        pass
