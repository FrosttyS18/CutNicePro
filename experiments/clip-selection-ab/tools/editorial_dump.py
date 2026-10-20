#!/usr/bin/env python3
"""Dossiê editorial dos cortes escolhidos por perfil (A/C/D).
Extrai, para cada corte: texto integral, contexto anterior/posterior e a
linha do tempo da transcrição ao redor. Serve de base para avaliação
editorial HUMANA/GUIADA — nenhum nome, palavra ou timestamp do episódio
está fixado em código.
Uso: python tools/editorial_dump.py > reports/editorial/discover-dossier.md
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import discover

HERE = discover.HERE


def main():
    segs, duration = discover.load_context()
    out = io.StringIO()
    out.write("# Dossiê editorial — descoberta por janelas (retomada)\n\n")
    out.write(f"Transcrição: {len(segs)} falas, 0–{duration:.1f}s.\n")
    out.write("Cortes escolhidos por DP após avaliação do próprio perfil.\n\n")
    for prof in ("a", "c", "d"):
        path = os.path.join(HERE, "reports", f"discover-{prof}.json")
        rep = json.load(open(path, encoding="utf-8"))
        res = rep["resultado"]
        out.write(f"## Perfil {prof.upper()} — {res['status']}\n")
        out.write(f"Modelo: {rep['modelo']}\n")
        out.write(f"Amostragem: {rep['config']['sampling_source']}\n\n")
        for i, c in enumerate(res["clips"], 1):
            texts = [s for s in segs if s["start"] < c["end"] and s["end"] > c["start"]]
            full = " ".join(s["text"] for s in texts)
            out.write(f"### {prof.upper()}{i} {c['start']:.1f}s–{c['end']:.1f}s "
                      f"({c['end']-c['start']:.1f}s, nota aval={c['score']})\n")
            out.write(f"- origem: {c.get('origem','')}\n")
            out.write(f"- razão da avaliação: {c['razao']}\n")
            before = [s for s in segs if s["end"] <= c["start"] + 1e-9]
            after = [s for s in segs if s["start"] >= c["end"] - 1e-9]
            if before:
                out.write(f"- contexto ANTERIOR (fora do corte): {before[-1]['text']}\n")
            if after:
                out.write(f"- contexto POSTERIOR (fora do corte): {after[0]['text']}\n")
            out.write(f"- TEXTO INTEGRAL: {full}\n\n")
        out.write("\n")
    # linha do tempo compacta para localizar histórias (janela 0–140s)
    out.write("## Linha do tempo 0–140s (para referência editorial)\n\n")
    for s in segs:
        if s["start"] >= 140:
            break
        out.write(f"- [{s['id']}] {s['start']:.1f}s: {s['text']}\n")
    dest = os.path.join(HERE, "reports", "editorial", "discover-dossier.md")
    io.open(dest, "w", encoding="utf-8").write(out.getvalue())
    print(f"dossiê → {dest} ({len(out.getvalue())} chars)")


if __name__ == "__main__":
    main()
