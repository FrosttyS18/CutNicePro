"""Hook PreToolUse (matcher: Bash) — previne comandos destrutivos no workspace CutNicePro.

Exit 0 = liberado; exit 2 = bloqueado (o stderr vira feedback para o agente).
Análise por segmentos (separados por ; | &): um comando só é bloqueado quando o
SEGMENTO começa com o padrão destrutivo, evitando falsos positivos como
`grep "git reset --hard" arquivo` (o segmento começa com grep).
No-op fora do workspace CutNicePro. Se o payload não puder ser lido, falha aberto (exit 0).
"""
import re
import sys

from common import in_workspace, log_audit, read_stdin_json, session_id

BLOCK_MESSAGE = (
    "[CutNicePro guard] Operação potencialmente destrutiva BLOQUEADA: {detail}. "
    "Use um comando mais restrito (alvo específico, sem apagar recursivamente); "
    "se a operação destrutiva for realmente necessária, peça ao usuário para executá-la "
    "manualmente ou desativar temporariamente o toggle de hooks no ZCode "
    "(Settings de hooks)."
)


def _strip_sudo(s: str) -> str:
    while True:
        m = re.match(r"^(sudo|doas)\s+", s)
        if not m:
            return s
        s = s[m.end():]


def analyze_segment(seg: str):
    """Devolve (motivo, segmento) quando o segmento é destrutivo; senão None."""
    s = _strip_sudo(seg.strip())
    if not s:
        return None

    # rm com flags contendo r E f (qualquer ordem/combinação: -rf, -fr, -rvf...)
    m = re.match(r"^rm\s+((?:-[a-zA-Z]+\s+)+)", s)
    if m:
        flags = m.group(1)
        if "r" in flags and "f" in flags:
            return ("rm com -r e -f", s)

    if re.fullmatch(r"git\s+reset\s+--hard(\s+\S+)*", s):
        return ("git reset --hard", s)

    if re.match(r"^git\s+clean\s+-[a-zA-Z]*[fdx]", s):
        return ("git clean -f/-d/-x", s)

    if re.match(r"^git\s+push\b", s):
        if re.search(r"--force(?![\w-])", s) or re.search(r"(?<![\w-])-f\b", s):
            return ("git push --force/-f", s)

    if re.fullmatch(r"git\s+(checkout\s+(--\s+)?\.|restore\s+\.)", s):
        return ("descarte total de mudanças (git checkout/restore .)", s)

    if re.match(r"^(rmdir|rd)\s+(/[sq]\b|-[a-zA-Z]*s)", s, re.IGNORECASE):
        return ("rmdir/rd recursivo", s)

    if re.match(r"^del\s+(/[fsq]\b)", s, re.IGNORECASE):
        return ("del /f /s /q", s)

    if re.match(r"^remove-item\b", s, re.IGNORECASE) and re.search(r"-recurse", s, re.IGNORECASE) \
            and re.search(r"-force", s, re.IGNORECASE):
        return ("Remove-Item -Recurse -Force", s)

    if re.match(r"^format\s+[a-z]:", s, re.IGNORECASE):
        return ("format de unidade", s)

    return None


def main() -> None:
    data = read_stdin_json()
    if not in_workspace(sys.argv):
        sys.exit(0)

    tool_input = data.get("tool_input") or {}
    cmd = str(tool_input.get("command") or "")
    if not cmd:
        sys.exit(0)  # não é um comando de shell conhecido — não interfere

    findings = []
    for seg in re.split(r"[;|&]+", cmd):
        hit = analyze_segment(seg)
        if hit:
            findings.append(hit)

    if findings:
        detail = "; ".join(f"{why} → `{seg}`" for why, seg in findings)
        sys.stderr.write(BLOCK_MESSAGE.format(detail=detail) + "\n")
        log_audit({
            "event": "PreToolUse",
            "hook": "guard_destructive",
            "result": "BLOCK",
            "tool": str(data.get("tool_name", ""))[:40],
            "session_id": session_id(),
            "findings": [why for why, _ in findings],
            "command": cmd[:300],
        })
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
