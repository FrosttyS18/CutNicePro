"""Baseline de regressões do CutNicePro — executada pelo hook Stop (fast) e standalone.

Dois níveis:
  --fast  apenas checks estruturais (AGENTS.md, JSON do MCP, frontmatter das skills,
          compilação dos scripts de hook). Suítes de teste (npm/pytest) ficam SKIP.
          Usado pelo hook Stop a cada resposta: rápido e limitado em tempo.
  --full  (padrão, standalone) tudo do fast + suítes de teste quando existirem.
          Executar EXPLICITAMENTE antes de concluir implementações relevantes.

Uso:  python baseline_checks.py [--project C:\\CutNicePro] [--fast]
Saída: JSON na última linha; exit 0 = sem falhas, exit 1 = há falhas.
Cada check devolve (status, detail) com status em {"PASS","FAIL","SKIP"}.
"""
import argparse
import datetime
import glob
import json
import os
import py_compile
import shutil
import subprocess
import sys

DEFAULT_ROOT = r"C:\CutNicePro"


def _require(cond, message):
    if not cond:
        raise AssertionError(message)


def run_check(result, name, fn):
    try:
        status, detail = fn()
        if status not in ("PASS", "FAIL", "SKIP"):
            raise ValueError(f"status invalido: {status}")
    except Exception as exc:  # noqa: BLE001 — check que quebra vira FAIL, não crash
        status, detail = "FAIL", str(exc)[:300]
    result["checks"].append({"name": name, "status": status, "detail": detail})


def check_agents_md(root):
    def fn():
        p = os.path.join(root, "AGENTS.md")
        _require(os.path.isfile(p) and os.path.getsize(p) > 0, "AGENTS.md ausente ou vazio")
        return "PASS", "ok"
    return fn


def check_mcp_config(root):
    def fn():
        p = os.path.join(root, ".zcode", "config.json")
        if not os.path.isfile(p):
            return "SKIP", "config.json ausente (ok por enquanto)"
        with open(p, "r", encoding="utf-8") as f:
            json.load(f)
        return "PASS", "json valido"
    return fn


def check_skills_frontmatter(root):
    def fn():
        base = os.path.join(root, ".zcode", "skills")
        if not os.path.isdir(base):
            return "SKIP", "sem diretorio de skills"
        count = 0
        for entry in sorted(os.listdir(base)):
            skill = os.path.join(base, entry, "SKILL.md")
            if not os.path.isfile(skill):
                continue
            with open(skill, "r", encoding="utf-8") as f:
                lines = f.read().splitlines()
            _require(lines and lines[0].strip() == "---", f"{entry}: sem frontmatter inicial")
            _require(any(l.startswith("name:") for l in lines[1:30]), f"{entry}: sem name:")
            count += 1
        return "PASS", f"{count} skills com frontmatter ok"
    return fn


def check_hook_scripts(root):
    def fn():
        base = os.path.join(root, ".zcode", "hooks", "scripts")
        if not os.path.isdir(base):
            return "SKIP", "sem scripts de hook"
        count = 0
        for fn_name in sorted(os.listdir(base)):
            if fn_name.endswith(".py"):
                py_compile.compile(os.path.join(base, fn_name), doraise=True)
                count += 1
        return "PASS", f"{count} scripts compilam"
    return fn


def check_app_tests(root, fast):
    def fn():
        if fast:
            return "SKIP", "modo fast (hook Stop): rodar baseline --full antes de concluir implementacoes"
        # O app Node vive em app/ (Vite/Tauri); a raiz nao tem package.json.
        candidates = [root, os.path.join(root, "app")]
        pkg_root = next((p for p in candidates
                         if os.path.isfile(os.path.join(p, "package.json"))), None)
        if pkg_root is None:
            return "SKIP", "sem package.json (app nao implementado)"
        with open(os.path.join(pkg_root, "package.json"), "r", encoding="utf-8") as f:
            scripts = (json.load(f).get("scripts") or {})
        if not scripts.get("test"):
            return "SKIP", "package.json sem script de teste"
        npm = shutil.which("npm")
        _require(npm, "npm nao encontrado no PATH")
        proc = subprocess.run([npm, "test"], cwd=pkg_root, capture_output=True,
                              text=True, timeout=240)
        _require(proc.returncode == 0, "npm test falhou: " + (proc.stdout or proc.stderr or "")[-300:])
        where = "raiz" if pkg_root == root else "app/"
        return "PASS", f"npm test OK ({where})"
    return fn


def check_python_tests(root, fast):
    def fn():
        if fast:
            return "SKIP", "modo fast (hook Stop): rodar baseline --full antes de concluir implementacoes"
        hits = [h for h in glob.glob(os.path.join(root, "**", "test_*.py"), recursive=True)
                if os.sep + ".tooling" + os.sep not in h]
        if not hits:
            return "SKIP", "sem testes python do projeto"
        proc = subprocess.run([sys.executable, "-m", "pytest", "-q", root],
                              cwd=root, capture_output=True, text=True, timeout=240)
        _require(proc.returncode == 0, "pytest falhou: " + (proc.stdout or proc.stderr or "")[-300:])
        return "PASS", "pytest OK"
    return fn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=DEFAULT_ROOT)
    ap.add_argument("--fast", action="store_true",
                    help="modo rapido: apenas checks estruturais; suites de teste ficam SKIP")
    args = ap.parse_args()
    root = os.path.abspath(args.project)

    result = {"ts": datetime.datetime.now().isoformat(timespec="seconds"),
              "mode": "fast" if args.fast else "full", "checks": []}
    run_check(result, "agents_md", check_agents_md(root))
    run_check(result, "mcp_config", check_mcp_config(root))
    run_check(result, "skills_frontmatter", check_skills_frontmatter(root))
    run_check(result, "hook_scripts", check_hook_scripts(root))
    run_check(result, "app_tests", check_app_tests(root, args.fast))
    run_check(result, "python_tests", check_python_tests(root, args.fast))

    statuses = [c["status"] for c in result["checks"]]
    result["passed"] = statuses.count("PASS")
    result["failed"] = statuses.count("FAIL")
    result["skipped"] = statuses.count("SKIP")
    result["status"] = "FAIL" if result["failed"] else "PASS"

    print(json.dumps(result, ensure_ascii=False))
    sys.exit(1 if result["failed"] else 0)


if __name__ == "__main__":
    main()
