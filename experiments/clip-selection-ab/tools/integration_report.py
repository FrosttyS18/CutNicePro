#!/usr/bin/env python3
"""Relatório da integração experimental (atualização 8).

Lê os artefatos da geração REAL pelo caminho integrado do app
(.tooling/vendor/pipeline-validation-gemma) e compara com a saída do
experimento (atualização 7, perfil D). Nenhum dado é inventado: tudo vem
dos logs/JSONs produzidos pelas execuções.
Uso: python tools/integration_report.py
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTEGRATED = r"C:\CutNicePro\.tooling\vendor\pipeline-validation-gemma"


def read(p):
    return io.open(p, encoding="utf-8").read()


def parse_log(path):
    facts = {"load_ms": None, "prompt_tokens": None, "prompt_ms": None,
             "gen_tokens": None, "gen_ms": None, "backend": None}
    if not os.path.isfile(path):
        return None
    log = read(path)
    for line in log.splitlines():
        m = re.search(r"load time =\s+([\d.]+) ms", line)
        if m:
            facts["load_ms"] = float(m.group(1))
        m = re.search(r"prompt eval time =\s+([\d.]+) ms /\s+(\d+) tokens", line)
        if m:
            facts["prompt_ms"], facts["prompt_tokens"] = float(m.group(1)), int(m.group(2))
        m = re.search(r"eval time =\s+([\d.]+) ms /\s+(\d+) runs", line)
        if m:
            facts["gen_ms"], facts["gen_tokens"] = float(m.group(1)), int(m.group(2))
    if facts["prompt_tokens"] and facts["prompt_ms"]:
        facts["prompt_tok_s"] = round(facts["prompt_tokens"] / (facts["prompt_ms"] / 1000.0), 1)
    if facts["gen_tokens"] and facts["gen_ms"]:
        facts["gen_tok_s"] = round(facts["gen_tokens"] / (facts["gen_ms"] / 1000.0), 1)
    return facts


def main():
    if not os.path.isdir(INTEGRATED):
        print("Execucao integrada ausente:", INTEGRATED)
        sys.exit(1)
    measurements = json.loads(read(os.path.join(INTEGRATED, "measurements.json")))
    collection = json.loads(read(os.path.join(INTEGRATED, "generated-clips-gemma.json")))
    scratch = os.path.join(INTEGRATED, "generation")
    calls = []
    for name in sorted(os.listdir(scratch)):
        if name.endswith(".log"):
            stem = name[:-4]
            facts = parse_log(os.path.join(scratch, name))
            if facts and (facts["prompt_tokens"] or facts["gen_tokens"]):
                calls.append({"stage": stem, **facts})
    experiment = json.loads(read(os.path.join(HERE, "reports", "discover-d.json")))
    exp_clips = experiment["resultado"]["clips"]

    out = io.StringIO()
    out.write("# Integração experimental Gemma — execução real e comparação\n\n")
    out.write("Gerado por tools/integration_report.py a partir dos artefatos reais.\n\n")
    out.write("## Tempos medidos (caminho integrado)\n\n")
    out.write(f"- Descoberta do motor (config+modelo+probe GPU): {measurements['engine_discovery_s']:.1f} s\n")
    out.write(f"- Pipeline completo (janelas→seleção→avaliação→cenas→análise): {measurements['pipeline_total_s']:.1f} s\n\n")
    out.write("### Chamadas por etapa (logs do runtime)\n\n")
    out.write("| etapa | load ms | prompt tokens | prompt tok/s | gen tokens | gen tok/s |\n")
    out.write("|---|---|---|---|---|---|\n")
    for call in calls:
        out.write(f"| {call['stage']} | {call.get('load_ms') or '—'} | "
                  f"{call.get('prompt_tokens') or '—'} | {call.get('prompt_tok_s', '—')} | "
                  f"{call.get('gen_tokens') or '—'} | {call.get('gen_tok_s', '—')} |\n")
    total_load = sum(c["load_ms"] for c in calls if c["load_ms"]) / 1000.0
    out.write(f"\nSoma dos carregamentos de modelo por chamada: {total_load:.1f} s "
              "(cada chamada é um processo novo; sem cache entre etapas)\n\n")
    out.write("## Cortes integrados vs experimento (perfil D, atualização 7)\n\n")
    out.write("| | início | fim | duração | nota | título (integrado) |\n|---|---|---|---|---|---|\n")
    for clip in collection["clips"]:
        out.write(f"| integrado | {clip['start']:.1f} | {clip['end']:.1f} | "
                  f"{clip['end']-clip['start']:.1f} | {clip['score']} | {clip['title']} |\n")
    for clip in exp_clips:
        out.write(f"| experimento | {clip['start']:.1f} | {clip['end']:.1f} | "
                  f"{clip['end']-clip['start']:.1f} | {clip['score']} | (fora do app) |\n")
    same = {(round(c["start"], 1), round(c["end"], 1)) for c in collection["clips"]} & \
           {(round(c["start"], 1), round(c["end"], 1)) for c in exp_clips}
    out.write(f"\nIntervalos idênticos entre os dois caminhos: {len(same)} de 3.\n")
    out.write("\n## Metadados técnicos persistidos\n\n")
    out.write("```json\n" + json.dumps(collection.get("engine"), ensure_ascii=False, indent=1) + "\n```\n")
    dest = os.path.join(HERE, "reports", "integration-report.md")
    io.open(dest, "w", encoding="utf-8").write(out.getvalue())
    print(f"relatório → {dest}")


if __name__ == "__main__":
    main()
