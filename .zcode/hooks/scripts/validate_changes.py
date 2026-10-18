"""Hook PostToolUse (matcher: Edit|Write|ApplyPatch) — validação leve de arquivos alterados.

Validações (rápidas, stdlib apenas):
  - .json            → deve parsear como JSON
  - .py              → deve compilar
  - .js/.mjs/.cjs    → node --check (se o node existir)
  - SKILL.md         → frontmatter com name:
Falha não desfaz nada: o resultado é registrado no log de auditoria e, quando o
schema do ZCode aceita, injetado como additionalContext para o agente corrigir.
Exit 0 sempre (PostToolUse não bloqueia). No-op fora do workspace.
"""
import json
import os
import shutil
import subprocess
import sys

from common import in_workspace, log_audit, read_stdin_json, session_id


def check_json(path: str):
    with open(path, "r", encoding="utf-8-sig") as f:
        json.load(f)
    return True


def check_python(path: str):
    with open(path, "r", encoding="utf-8") as f:
        source = f.read()
    compile(source, path, "exec")
    return True


def check_node(path: str):
    node = shutil.which("node")
    if not node:
        return True  # sem node instalado: pula
    proc = subprocess.run(
        [node, "--check", path],
        capture_output=True, text=True, timeout=15,
    )
    if proc.returncode != 0:
        raise SyntaxError((proc.stderr or "").strip()[:400])
    return True


def check_skill_md(path: str):
    with open(path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()
    if not lines or lines[0].strip() != "---":
        raise SyntaxError("SKILL.md sem frontmatter inicial '---'")
    for line in lines[1:30]:
        if line.strip() == "---":
            break
        if line.startswith("name:"):
            return True
    raise SyntaxError("SKILL.md sem 'name:' no frontmatter")


def validate(path: str):
    base = os.path.basename(path).lower()
    ext = os.path.splitext(path)[1].lower()
    if ext == ".json":
        return check_json(path)
    if ext == ".py":
        return check_python(path)
    if ext in (".js", ".mjs", ".cjs"):
        return check_node(path)
    if base == "skill.md":
        return check_skill_md(path)
    return None  # sem verificação para esta extensão


def main() -> None:
    data = read_stdin_json()
    if not in_workspace(sys.argv):
        sys.exit(0)

    tool_input = data.get("tool_input") or {}
    path = str(tool_input.get("file_path") or tool_input.get("path") or "")
    if not path or not os.path.isfile(path):
        sys.exit(0)

    try:
        result = validate(path)
    except Exception as exc:  # noqa: BLE001 — validação reporta qualquer falha
        message = f"[CutNicePro validate] FALHA de validação em {path}: {exc}"
        log_audit({
            "event": "PostToolUse",
            "hook": "validate_changes",
            "result": "FAIL",
            "file": path,
            "error": str(exc)[:400],
            "session_id": session_id(),
        })
        # additionalContext é chave reconhecida do schema de saída de hooks.
        # Se o evento não a aceitar, a saída é descartada com segurança.
        sys.stdout.write(json.dumps({"additionalContext": message}))
        sys.exit(0)

    log_audit({
        "event": "PostToolUse",
        "hook": "validate_changes",
        "result": "PASS" if result else "SKIP",
        "file": path,
        "session_id": session_id(),
    })
    sys.exit(0)


if __name__ == "__main__":
    main()
