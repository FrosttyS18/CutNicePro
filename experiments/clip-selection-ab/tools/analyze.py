"""Métricas independentes e verificação de preservação do experimento A/B.

Somente biblioteca padrão. Trata os JSONs de reports/ como dados.
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS = os.path.join(HERE, "reports")
DATA = os.path.join(HERE, "data")
APPDATA = os.path.expandvars(r"%APPDATA%\com.cutnicepro.app\cutnicepro")


def load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def tokens(text):
    return re.findall(r"[a-z0-9à-ú]+", text.lower())


def ngrams(words, n):
    return set(tuple(words[i:i + n]) for i in range(len(words) - n + 1))


def jaccard(a, b):
    if not a and not b:
        return 0.0
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def clip_text(segments, start, end):
    return " ".join(
        s["text"] for s in segments if s["start"] < end and s["end"] > start
    )


def strategy_metrics(clips, segments, options, duration):
    texts = [tokens(clip_text(segments, c["start"], c["end"])) for c in clips]
    pairwise = []
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            pairwise.append({
                "par": [i, j],
                "jaccard_unigram": round(jaccard(set(texts[i]), set(texts[j])), 4),
                "jaccard_bigram": round(jaccard(ngrams(texts[i], 2), ngrams(texts[j], 2)), 4),
            })
    boundaries = []
    for c in clips:
        length = c["end"] - c["start"]
        boundaries.append({
            "start": c["start"], "end": c["end"], "duracao": round(length, 2),
            "duracao_valida": options["min_seconds"] - 1e-6 <= length <= options["max_seconds"] + 1e-6,
            "dentro_da_midia": c["end"] <= duration + 1e-6 and c["start"] >= 0.0,
            "start_em_segmento": any(abs(s["start"] - c["start"]) < 0.05 for s in segments),
        })
    starts = sorted(c["start"] for c in clips)
    gaps = [round(starts[i + 1] - starts[i], 2) for i in range(len(starts) - 1)]
    regions = sorted({int(c["start"] // 60) for c in clips})
    scores = [c["score"] for c in clips]
    return {
        "M1_cortes": len(clips),
        "M2_scores": {"soma": sum(scores), "mediana": sorted(scores)[len(scores)//2] if scores else None},
        "M3_sobreposição_textual": pairwise,
        "M3_max_jaccard_bigram": max((p["jaccard_bigram"] for p in pairwise), default=0.0),
        "M4_fronteiras": boundaries,
        "M4_todas_validas": all(b["duracao_valida"] and b["dentro_da_midia"] for b in boundaries),
        "M6_diversidade": {"gap_minimo_entre_starts_s": min(gaps) if gaps else None,
                            "regioes_60s_cobertas": regions},
        "picks": [{"start": c["start"], "end": c["end"], "score": c["score"]} for c in clips],
    }


def metrics():
    transcript = load(os.path.join(DATA, "transcript-davyjones.json"))
    segments = transcript["segments"]
    duration = float(open(os.path.join(DATA, "media-duration.txt")).read().strip())
    candidates = load(os.path.join(REPORTS, "candidates.json"))
    options = candidates["options"]
    out = {
        "coleta": {
            "janelas": candidates["windows"],
            "candidatos_por_janela": candidates["candidates_per_window"],
            "total_candidatos": len(candidates["candidates"]),
            "elapsed_s": candidates["elapsed_s"],
        }
    }
    for strategy in ("greedy", "dp", "joint"):
        path = os.path.join(REPORTS, f"real-{strategy}.json")
        if not os.path.exists(path):
            continue
        result = load(path)
        entry = strategy_metrics(result["clips"], segments, options, duration)
        entry["M5_descartes"] = [
            {"motivo": d["reason"], "nota": d["score"]} for d in result["discards"]
        ]
        entry["M5_resumo"] = {}
        for d in result["discards"]:
            key = d["reason"].split("(")[0].split("—")[0].strip()
            entry["M5_resumo"][key] = entry["M5_resumo"].get(key, 0) + 1
        entry["M7_tempo_s"] = result["elapsed_s"]
        entry["fallback"] = result.get("fallback")
        entry["detalhes"] = result.get("details")
        out[strategy] = entry
    production_path = os.path.join(DATA, "production-clips.json")
    if os.path.exists(production_path):
        production = load(production_path)
        out["producao_referencia"] = {
            "picks": [{"start": c["start"], "end": c["end"], "score": c["score"]}
                      for c in production["clips"]],
            "nota": "clipes gerados pelo app (pipeline atual) na produção; opções originais não são conhecidas",
        }
    controlled_path = os.path.join(REPORTS, "controlled.json")
    if os.path.exists(controlled_path):
        out["M8_controlado"] = []
        for sc in load(controlled_path)["scenarios"]:
            g, d = sc["greedy"], sc["dp"]
            out["M8_controlado"].append({
                "cenario": sc["name"],
                "gap_soma": d["score_sum"] - g["score_sum"],
                "gap_cortes": d["count"] - g["count"],
            })
    target = os.path.join(REPORTS, "metrics.json")
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(out, handle, ensure_ascii=False, indent=2)
    print(json.dumps({k: (v if k in ("coleta",) else {
        "M1": v.get("M1_cortes"), "M2": v.get("M2_scores"),
        "M3max": v.get("M3_max_jaccard_bigram"), "M4ok": v.get("M4_todas_validas"),
        "M7": v.get("M7_tempo_s"), "fallback": v.get("fallback"),
    }) for k, v in out.items() if isinstance(v, dict)}, ensure_ascii=False, indent=1))
    print(f"gravado: {target}")


def snapshot(full=False):
    files = {}
    for root, _dirs, names in os.walk(APPDATA):
        for name in names:
            if not full and not name.endswith(".json"):
                continue
            path = os.path.join(root, name)
            digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
            files[os.path.relpath(path, APPDATA)] = [digest, os.path.getsize(path)]
    return files


def preserve(phase):
    full = phase == "after-full"
    target = os.path.join(REPORTS, f"preservation-{phase}.json")
    snap = snapshot(full=full)
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(snap, handle, ensure_ascii=False, indent=1, sort_keys=True)
    print(f"gravado: {target} ({len(snap)} arquivos)")

def audit_recent():
    import time
    cutoff = time.mktime(time.strptime("2026-10-19 20:30", "%Y-%m-%d %H:%M"))
    recent = []
    for root, _dirs, names in os.walk(APPDATA):
        for name in names:
            path = os.path.join(root, name)
            mtime = os.path.getmtime(path)
            if mtime >= cutoff:
                recent.append([os.path.relpath(path, APPDATA),
                               time.strftime("%H:%M:%S", time.localtime(mtime))])
    result = {"cutoff": "2026-10-19 20:30 (início do experimento)",
              "arquivos_modificados_ou_criados_apos": sorted(recent)}
    target = os.path.join(REPORTS, "audit-mtime.json")
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False))
    print(f"gravado: {target}")


def preserve_check():
    before = load(os.path.join(REPORTS, "preservation-before.json"))
    after = load(os.path.join(REPORTS, "preservation-after.json"))
    changed = sorted(k for k in before if k in after and before[k] != after[k])
    added = sorted(k for k in after if k not in before)
    removed = sorted(k for k in before if k not in after)
    verdict = "PRESERVADO" if not (changed or added or removed) else "ALTERADO"
    result = {"verdict": verdict, "changed": changed, "added": added, "removed": removed}
    target = os.path.join(REPORTS, "preservation-check.json")
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False))
    print(f"gravado: {target}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "metrics"
    if mode == "metrics":
        metrics()
    elif mode in ("preserve-before", "preserve-after"):
        preserve(mode.split("-", 1)[1])
    elif mode == "preserve-check":
        preserve_check()
    elif mode == "preserve-after-full":
        preserve("after-full")
    elif mode == "audit":
        audit_recent()
    else:
        sys.exit(f"modo desconhecido: {mode}")
