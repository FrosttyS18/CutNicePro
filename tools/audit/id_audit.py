#!/usr/bin/env python3
"""Auditoria de IDs da documentação de produto do CutNicePro (versionado).

Varre os documentos canônicos em <root>/docs/product (+ AGENTS.md e CASE-STUDY-LOG),
extrai os IDs definidos por prefixo (FR/NFR: PRD; JRN: USER-JOURNEYS; BR: BUSINESS-RULES;
EPIC/US/AC: BACKLOG; DEC: DECISIONS) e verifica que toda referência aponta para um ID
definido. Reporta referências quebradas e lacunas de numeração.

Observação de semântica: "definido" = ID mencionado no arquivo canônico responsável
(padrão adotado desde a primeira auditoria, 2026-10-17); menções repetidas dentro do
próprio canônico são internas e legítimas.

Uso: python id_audit.py [--root CAMINHO]   (padrão: duas pastas acima deste arquivo)
Saída: texto legível; exit 0 sempre (é relatório, não gate).
"""
import argparse
import re
from pathlib import Path

CANON = {
    "FR": "docs/product/PRD.md",
    "NFR": "docs/product/PRD.md",
    "JRN": "docs/product/USER-JOURNEYS.md",
    "BR": "docs/product/BUSINESS-RULES.md",
    "EPIC": "docs/product/BACKLOG.md",
    "US": "docs/product/BACKLOG.md",
    "AC": "docs/product/BACKLOG.md",
    "DEC": "docs/product/DECISIONS.md",
}
SCAN = [
    "docs/product/PRD.md",
    "docs/product/USER-JOURNEYS.md",
    "docs/product/BUSINESS-RULES.md",
    "docs/product/INFORMATION-ARCHITECTURE.md",
    "docs/product/DECISIONS.md",
    "docs/product/BACKLOG.md",
    "docs/product/PRODUCT-BRAIN.md",
    "docs/product/TRACEABILITY.md",
    "AGENTS.md",
    "docs/portfolio/CASE-STUDY-LOG.md",
]
PAT = re.compile(r"\b(FR|NFR|JRN|BR|EPIC|US|AC|DEC)-(\d{3})\b")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    args = ap.parse_args()
    root = Path(args.root)

    defined = {p: set() for p in CANON}
    for prefix, rel in CANON.items():
        path = root / rel
        if not path.exists():
            print(f"AVISO: canonico ausente {rel}")
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            for m in PAT.finditer(line):
                if m.group(1) == prefix:
                    defined[prefix].add(f"{prefix}-{m.group(2)}")

    broken = []
    for rel in SCAN:
        path = root / rel
        if not path.exists():
            continue
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for m in PAT.finditer(line):
                prefix, num = m.group(1), m.group(2)
                if prefix in defined and f"{prefix}-{num}" not in defined[prefix]:
                    broken.append(f"{rel}:{i} -> {prefix}-{num} (nao definido)")

    print("== DEFINIDOS ==")
    for p in CANON:
        toks = sorted(defined[p])
        print(f"{p}: {len(toks)}" + (f" -> {toks[0]}..{toks[-1]}" if toks else ""))
    print("== REFERENCIAS QUEBRADAS ==")
    print("\n".join(broken) if broken else "0")
    print("== LACUNAS DE NUMERACAO ==")
    gaps_found = False
    for p in CANON:
        nums = sorted(int(t.split("-")[1]) for t in defined[p])
        gaps = [n for n in range(nums[0], nums[-1] + 1) if n not in nums] if nums else []
        if gaps:
            gaps_found = True
            print(f"{p}: faltando {['%s-%03d' % (p, g) for g in gaps]}")
    if not gaps_found:
        print("0")
    print("FIM")


if __name__ == "__main__":
    main()
