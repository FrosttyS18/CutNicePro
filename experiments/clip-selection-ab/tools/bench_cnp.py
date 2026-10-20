#!/usr/bin/env python3
"""Braço CutNicePro do benchmark controlado (atualização 11).

Porta fielmente o caminho AUTOMÁTICO + MOTOR GEMMA do app (commit b6f146e)
para execução sobre o MESMO backend Ollama do SupoClipLab:

- janelas com orçamento real de tokens (windows_budgeted: 8192−4−2000−120,
  sobreposição de fronteira min(max_seconds, span/2), verificação exata via
  llama-tokenize, subdivisão com recuo de costura);
- prompt de descoberta = app/src-tauri/src/clips/discover-auto-prompt.txt
  (sem " /no_think"), dados {minSeconds,maxSeconds,limit,speech} com IDs
  globais, schema firstId/lastId/score com enum de IDs;
- conform/repair_alternativos (nota de proposta válida; alternativa com
  nota=proveniência), avaliação em lotes de 8 (E{base+n} estáveis) com
  evaluate-prompt.txt + nature/advertising, piso editorial 50 e exclusão de
  publicidade do modo automático, DP (soma, cardinalidade, -inícios);
- amostragem/temp: temp 1.0, top_p 0.95, top_k 64, min_p 0, seed 42,
  thinking OFF (think=false na API nativa) — espelhando o perfil Gemma do
  app (llama-completion) no backend compartilhado.

Diferenças registradas vs produção: backend Ollama (mesma pesos/quant/
tokenizador; template aplicado pelo renderer gemma4 do Ollama em vez da
string canônica manual) e limites de QUANTIDADE elevados para o teto técnico
do bench (LAB ceiling 20) porque a quantidade é resultado, não meta.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_CLIPS = r"C:\CutNicePro\app\src-tauri\src\clips"
DATA = os.path.join(HERE, "data")
OUT_DIR = os.path.join(HERE, "reports", "bench")
SCRATCH = os.path.join(HERE, "scratch", "bench-cnp")
CAPTURE_URL = os.environ.get("BENCH_OLLAMA", "http://127.0.0.1:11435")
TOKENIZER = r"C:\CutNicePro\.tooling\vendor\analysis\bin\llama-tokenize.exe"
MODEL = r"C:\CutNicePro\experiments\clip-selection-ab\models\home-e\gemma-4-12b-it-qat-q4_0.gguf"

# Constantes do app (types.rs / selection.rs)
AUTOMATIC_MIN = 10.0
AUTOMATIC_MAX = 180.0
GEMMA_CTX = 8192
GEMMA_RESERVED = 4 + 2000 + 120
FLOOR = 50          # piso editorial do modo automático
LAB_CEILING = 20    # teto técnico do bench (quantidade = resultado)
WINDOW_SPAN = 600.0


def read(p):
    import io
    return io.open(p, encoding="utf-8").read()


def ollama_chat(messages, schema, tag):
    """Chamada nativa /api/chat: think=false + grammar + opções do perfil."""
    payload = {
        "model": "gemma4-qat",
        "messages": messages,
        "stream": False,
        "think": False,
        "format": schema,
        "options": {"temperature": 1.0, "top_p": 0.95, "top_k": 64,
                    "min_p": 0.0, "seed": 42, "num_ctx": 32768,
                    "num_predict": 8192},
    }
    t0 = time.time()
    req = urllib.request.Request(
        CAPTURE_URL + "/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=1800) as r:
        out = json.loads(r.read())
    elapsed = round(time.time() - t0, 1)
    os.makedirs(SCRATCH, exist_ok=True)
    with open(os.path.join(SCRATCH, f"{tag}-req.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    with open(os.path.join(SCRATCH, f"{tag}-resp.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    content = out.get("message", {}).get("content", "")
    stats = {
        "tag": tag, "elapsed_s": elapsed,
        "prompt_tokens": out.get("prompt_eval_count"),
        "gen_tokens": out.get("eval_count"),
    }
    return content, stats


def count_tokens(text, cache={}):
    key = hash(text)
    if key in cache:
        return cache[key]
    tmp = os.path.join(SCRATCH, "tok.in")
    os.makedirs(SCRATCH, exist_ok=True)
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    proc = subprocess.run(
        [TOKENIZER, "-m", MODEL, "-f", tmp, "--show-count"],
        capture_output=True, text=True, timeout=300)
    count = None
    for line in proc.stdout.splitlines():
        if "number of tokens" in line.lower():
            count = int(re.search(r"(\d+)", line.split(":")[-1]).group(1))
    if count is None:
        raise RuntimeError("tokenizador sem contagem")
    cache[key] = count
    return count


# ---------- janelas com orçamento (port de windows_budgeted) ----------

def window_data(segs, ws, we, min_s, max_s, limit):
    return {
        "minSeconds": min_s, "maxSeconds": max_s, "limit": limit,
        "speech": [[ws + j, s["start"], s["end"], s["text"]]
                   for j, s in enumerate(segs[ws:we])],
    }


def system_prompt():
    # App: Engine::prompt(Gemma) remove " /no_think" do system
    return read(os.path.join(APP_CLIPS, "discover-auto-prompt.txt")).replace(" /no_think", "").strip()


def user_payload(data):
    # App: escape de tags do template nos dados
    src = json.dumps(data, ensure_ascii=False).replace("<|", "< |")
    return src


def windows_budgeted(segs, min_s, max_s, limit, tok_calls):
    budget = GEMMA_CTX - GEMMA_RESERVED
    sys_p = system_prompt()

    def prompt_of(ws, we):
        return (f"<system>\n{sys_p}\n</system>\n<user>\n"
                + user_payload(window_data(segs, ws, we, min_s, max_s, limit))
                + "\n</user>")

    def exact(ws, we):
        n = count_tokens(prompt_of(ws, we))
        tok_calls.append({"window": [ws, we], "tokens": n})
        return n

    total = len(segs)
    full = prompt_of(0, total)
    full_tokens = count_tokens(full)
    tok_calls.append({"window": [0, total], "tokens": full_tokens, "calibracao": True})
    if full_tokens <= budget:
        return [(0, total)]
    seg_chars = [len(s["text"]) + 40 for s in segs]
    overhead = len(full) - sum(seg_chars)
    ratio = full_tokens / max(1, len(full))
    prefix = [0]
    for c in seg_chars:
        prefix.append(prefix[-1] + c)

    def estimate(ws, we):
        return int((prefix[we] - prefix[ws] + overhead) * ratio)

    planned = []
    start = 0
    while start < total:
        end = start
        while end < total and (end == start or (
                estimate(start, end + 1) <= budget
                and segs[end]["end"] - segs[start]["start"] <= WINDOW_SPAN)):
            end += 1
        planned.append((start, end))
        if end >= total:
            break
        span = segs[end - 1]["end"] - segs[start]["start"]
        boundary = segs[end - 1]["end"] - min(max_s, span / 2.0)
        start = next((i for i in range(start + 1, end)
                      if segs[i]["start"] >= boundary), end)
    verified = []
    queue = [(ws, we, 0) for ws, we in planned]
    while queue:
        ws, we, depth = queue.pop()
        if exact(ws, we) <= budget:
            verified.append((ws, we))
            continue
        assert depth < 4 and we - ws > 1, "janela insolúvel (fora do orçamento)"
        mid = (ws + we) // 2
        span = segs[we - 1]["end"] - segs[ws]["start"]
        overlap = min(max_s, span / 4.0)
        seam = segs[mid]["start"] - overlap
        back = next((i for i in range(ws, mid + 1) if segs[i]["start"] >= seam), mid)
        queue.append((back, we, depth + 1))
        queue.append((ws, mid, depth + 1))
    verified.sort()
    return verified


# ---------- conform / repair (port de selection.rs) ----------

def conform(first, last, score, segs, duration, min_s, max_s):
    if first > last or score > 100 or first >= len(segs) or last >= len(segs):
        return None
    start = segs[first]["start"]
    end = min(segs[last]["end"], duration)
    span = end - start
    if span < min_s or span > max_s:
        return None
    return (start, end, score, "proposta")


def repair(first, last, score, segs, duration, min_s, max_s):
    alts = []
    if first > last or score > 100 or first >= len(segs) or last >= len(segs):
        return alts
    f, l = segs[first], segs[last]
    natural_end = min(l["end"], duration)
    span = natural_end - f["start"]
    if span > max_s:
        floor = natural_end - max_s
        ceiling = natural_end - min_s
        for s in segs[:last + 1]:
            if floor <= s["start"] <= ceiling and min_s <= natural_end - s["start"] <= max_s:
                alts.append((s["start"], natural_end, score, "início avançado"))
                break
        for s in reversed(segs[first:]):
            e = min(s["end"], duration)
            if e - f["start"] <= max_s and e - f["start"] >= min_s:
                alts.append((f["start"], e, score, "fim recuado"))
                break
    elif span < min_s:
        for s in segs[first:]:
            e = min(s["end"], duration)
            if min_s <= e - f["start"] <= max_s:
                alts.append((f["start"], e, score, "fim estendido"))
                break
        floor = natural_end - max_s
        for s in reversed(segs[:last + 1]):
            if s["start"] >= floor and natural_end - s["start"] >= min_s:
                alts.append((s["start"], natural_end, score, "início recuado"))
                break
    return alts


# ---------- avaliação em lotes (port de evaluate_batch_with) ----------

def evaluate_batch(clips, segs, tag_prefix):
    eval_sys = read(os.path.join(APP_CLIPS, "evaluate-prompt.txt")).replace(" /no_think", "").strip()
    results = []
    stats = []
    for ci, chunk in enumerate([clips[i:i + 8] for i in range(0, len(clips), 8)]):
        labels = [f"E{ci * 8 + i + 1}" for i in range(len(chunk))]
        items = []
        for i, clip in enumerate(chunk):
            text = " ".join(s["text"] for s in segs
                            if s["start"] < clip["end"] and s["end"] > clip["start"])
            bef = [s for s in segs if s["end"] <= clip["start"] + 1e-9]
            aft = [s for s in segs if s["start"] >= clip["end"] - 1e-9]
            items.append({
                "id": labels[i],
                "start": round(clip["start"], 3), "end": round(clip["end"], 3),
                "text": text,
                "contextBefore": bef[-1]["text"] if bef else None,
                "contextAfter": aft[0]["text"] if aft else None,
            })
        data = json.dumps({"candidates": items}, ensure_ascii=False).replace("<|", "< |")
        schema = {"type": "object", "additionalProperties": False,
                  "required": ["items"],
                  "properties": {"items": {"type": "array", "maxItems": len(chunk), "items": {
                      "type": "object", "additionalProperties": False,
                      "required": ["id", "score", "reason", "nature", "advertising"],
                      "properties": {
                          "id": {"type": "string", "enum": labels},
                          "score": {"type": "integer", "minimum": 0, "maximum": 100},
                          "reason": {"type": "string"},
                          "nature": {"type": "string",
                                     "enum": ["relato", "humor", "explicacao",
                                              "opiniao", "demonstracao"]},
                          "advertising": {"type": "boolean"}}}}}}
        messages = [
            {"role": "system", "content": eval_sys},
            {"role": "user", "content": data},
        ]
        content, st = ollama_chat(messages, schema, f"{tag_prefix}-eval-{ci}")
        st["lote"] = ci
        stats.append(st)
        parsed = json.loads(content)
        results.extend(parsed.get("items", []))
    return results, stats


# ---------- DP (port de finalize_weighted) ----------

def dp_select(clips, count):
    n = len(clips)
    if n == 0 or count == 0:
        return []
    order = sorted(range(n), key=lambda i: (clips[i]["end"], clips[i]["start"]))
    best = [[None] * (count + 1) for _ in range(n + 1)]
    best[0][0] = (0, 0, 0.0, [])
    for i in range(1, n + 1):
        idx = order[i - 1]
        prefix = 0
        while prefix < i - 1 and clips[order[prefix]]["end"] <= clips[idx]["start"]:
            prefix += 1
        for k in range(count + 1):
            cur = best[i - 1][k]
            if k >= 1 and best[prefix][k - 1] is not None:
                s, l, g, path = best[prefix][k - 1]
                cand = (s + clips[idx]["score"], l + 1,
                        g - clips[idx]["start"], path + [idx])
                if cur is None or cand[:3] > cur[:3]:
                    cur = cand
            best[i][k] = cur
    winner = None
    winner_k = 0
    for k in range(count + 1):
        cell = best[n][k]
        if cell is None:
            continue
        if winner is None or cell[0] > winner[0] or (cell[0] == winner[0] and k > winner_k):
            winner = cell
            winner_k = k
    if winner is None:
        return []
    return [clips[i] for i in winner[3]]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    segs = json.loads(read(os.path.join(HERE, "media", "reference-transcript.segments.json"))) \
        if os.path.isdir(os.path.join(HERE, "media")) else \
        json.loads(read(r"C:\SupoClipLab\media\reference-transcript.segments.json"))
    duration = 599.098
    min_s, max_s = AUTOMATIC_MIN, AUTOMATIC_MAX
    limit = LAB_CEILING

    trace = {"etapa": {}, "descartes": []}
    tok_calls = []
    t0 = time.time()
    windows = windows_budgeted(segs, min_s, max_s, limit, tok_calls)
    trace["etapa"]["janelas"] = {
        "budget": GEMMA_CTX - GEMMA_RESERVED,
        "janelas": windows, "medicoes_tokenizador": tok_calls,
        "segundos": round(time.time() - t0, 1),
    }
    print(f"[cnp-bench] janelas: {windows}")

    sys_p = system_prompt()
    raw_candidates = []
    disc_stats = []
    for wi, (ws, we) in enumerate(windows):
        data = window_data(segs, ws, we, min_s, max_s, limit)
        ids = list(range(ws, we))
        schema = {"type": "object", "additionalProperties": False,
                  "required": ["candidates"],
                  "properties": {"candidates": {"type": "array", "maxItems": limit, "items": {
                      "type": "object", "additionalProperties": False,
                      "required": ["firstId", "lastId", "score"],
                      "properties": {
                          "firstId": {"type": "integer", "enum": ids},
                          "lastId": {"type": "integer", "enum": ids},
                          "score": {"type": "integer", "minimum": 0, "maximum": 100}}}}}}
        messages = [{"role": "system", "content": sys_p},
                    {"role": "user", "content": user_payload(data)}]
        content, st = ollama_chat(messages, schema, f"discover-w{wi}")
        st["janela"] = [ws, we]
        disc_stats.append(st)
        reply = json.loads(content)
        cands = reply.get("candidates", [])[:limit]
        raw_candidates.append({"window": [ws, we], "candidates": cands})
        print(f"[cnp-bench] w{wi}: {len(reply.get('candidates', []))} propostas "
              f"(tomadas {len(cands)}) em {st['elapsed_s']}s")
    trace["etapa"]["descoberta"] = {"por_janela": disc_stats, "brutos": raw_candidates}

    # resolve(): porta com registro de TODOS os descartes
    built = []       # contendedores
    pending = []     # aguardando avaliação (alternativas)
    for entry in raw_candidates:
        ws, we = entry["window"]
        for c in entry["candidates"]:
            f, l = c["firstId"], c["lastId"]
            if not (ws <= f < we) or not (ws <= l < we):
                trace["descartes"].append({"motivo": "ids fora da janela proposta",
                                           "candidato": c, "janela": [ws, we]})
                continue
            ok = conform(f, l, c["score"], segs, duration, min_s, max_s)
            if ok:
                built.append({"start": ok[0], "end": ok[1], "score": ok[2],
                              "origem": f"proposta [{f},{l}] w{ws}-{we}",
                              "valid_score": c["score"], "nature": None,
                              "advertising": False, "razao": ""})
            else:
                for alt in repair(f, l, c["score"], segs, duration, min_s, max_s):
                    pending.append({"start": alt[0], "end": alt[1],
                                    "score": alt[2],
                                    "origem": f"alternativa '{alt[3]}' de [{f},{l}]",
                                    "valid_score": None, "nature": None,
                                    "advertising": False,
                                    "razao": "nota original é proveniência, não avaliação"})
    trace["etapa"]["construcao"] = {
        "diretos": len(built), "alternativas_pendentes": len(pending)}

    # avaliação das pendentes em lotes
    eval_results, eval_stats = ([], [])
    if pending:
        eval_results, eval_stats = evaluate_batch(
            pending, segs, "cnp")
    for judgment in eval_results:
        try:
            pos = int(judgment["id"][1:]) - 1
        except (KeyError, ValueError):
            continue
        if 0 <= pos < len(pending) and pending[pos]["valid_score"] is None:
            p = pending[pos]
            p["valid_score"] = judgment["score"]
            p["nature"] = judgment.get("nature")
            p["advertising"] = bool(judgment.get("advertising", False))
            ad = "publicidade, " if p["advertising"] else ""
            p["razao"] = (f"Avaliação do intervalo efetivo ({ad}"
                          f"{judgment.get('nature', 'relato')}): {judgment.get('reason', '')}")
    trace["etapa"]["avaliacao"] = {"lotes": eval_stats,
                                   "pendentes": len(pending),
                                   "avaliadas": sum(1 for p in pending if p["valid_score"] is not None)}

    # disputa: diretos + alternativas avaliadas; filtros automáticos
    dispute = list(built)
    for p in pending:
        if p["valid_score"] is not None:
            dispute.append(p)
    for c in dispute:
        if c["advertising"]:
            trace["descartes"].append({"motivo": "política automática: publicidade",
                                       "candidato": {k: c[k] for k in ("start", "end", "origem")}})
        elif c["valid_score"] is not None and c["valid_score"] < FLOOR:
            trace["descartes"].append({"motivo": f"piso editorial {FLOOR}",
                                       "candidato": {k: c[k] for k in ("start", "end", "origem", "valid_score")}})
    dispute = [c for c in dispute
               if not c["advertising"]
               and (c["valid_score"] is None or c["valid_score"] >= FLOOR)]
    for c in dispute:
        c["score"] = c["valid_score"] if c["valid_score"] is not None else c["score"]

    dispute.sort(key=lambda c: (-c["score"], c["start"]))
    chosen = dp_select(dispute, LAB_CEILING)
    for c in chosen:
        texts = [s["text"] for s in segs if s["start"] < c["end"] and s["end"] > c["start"]]
        c["abertura"] = texts[0] if texts else ""
        c["fechamento"] = texts[-1] if texts else ""
    trace["etapa"]["selecao"] = {
        "em_disputa": len(dispute), "escolhidos": len(chosen)}
    trace["resultado"] = chosen
    trace["config"] = {
        "modo": "automatico (app) + motor gemma experimental",
        "backend": f"ollama nativo via {CAPTURE_URL} (mesmos pesos/quant/seed/thinking-off)",
        "amostragem": "temp 1.0, top_p 0.95, top_k 64, min_p 0, seed 42, think=false",
        "limites": {"min_s": min_s, "max_s": max_s,
                    "por_janela": limit, "teto_final_bench": LAB_CEILING,
                    "piso_editorial": FLOOR},
        "transcricao": "referência compartilhada (322 falas, whisper.cpp base do app)",
    }

    dest = os.path.join(OUT_DIR, "cnp-controlled.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(trace, f, ensure_ascii=False, indent=1)
    print(f"[cnp-bench] {len(chosen)} cortes; brutos={sum(len(e['candidates']) for e in raw_candidates)} "
          f"construidos={len(built)+len(pending)} disputa={len(dispute)} -> {dest}")


if __name__ == "__main__":
    main()
