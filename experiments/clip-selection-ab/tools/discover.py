#!/usr/bin/env python3
"""Descoberta por unidades narrativas com JANELAS — retomada da atualização 6.

Correções exigidas pela retomada (item 2 da tarefa):
- a chamada ao modelo está DENTRO do laço de janelas;
- os candidatos de TODAS as janelas são acumulados;
- IDs globais em todas as janelas (firstId/lastId referem-se à transcrição);
- janelas dimensionadas pelo prompt FINAL tokenizado (template + reservas),
  com verificação exata e subdivisão registrada — nunca truncamento;
- falha de uma janela NÃO vira "zero candidatos": status por janela e
  política explícita de resultado parcial;
- orçamento finito de chamadas LLM declarado ANTES da execução.

Política de status: EXECUÇÃO_FALHOU · ANÁLISE_VÁLIDA_SEM_CANDIDATOS ·
RESULTADO_PARCIAL · RESULTADO_COMPLETO.

Uso:
  python tools/discover.py --profile a [--prove]
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import winfer
import wplan

HERE = winfer.HERE
SCRATCH = os.path.join(HERE, "scratch")
REPORTS = os.path.join(HERE, "reports")
DATA = os.path.join(HERE, "data")

MIN_S, MAX_S, COUNT = 15.0, 90.0, 3
PER_WINDOW_LIMIT = 6          # propostas máx. por janela (mesma regra da atualização 6)
MAX_TOTAL = 12                # teto global após dedupe
EVAL_BATCH = 8
CTX_MARGIN = 120              # folga além de n_predict e dos 4 tokens reservados


def read(p):
    return io.open(p, encoding="utf-8").read()


def load_context():
    transcript = json.loads(read(os.path.join(DATA, "transcript-davyjones.json")))
    segs = transcript["segments"]
    duration = float(read(os.path.join(DATA, "media-duration.txt")).strip())
    return segs, duration


def system_for(profile, kind):
    """kind: 'discover' | 'evaluate'. /no_think só existe no perfil a
    (híbrido Qwen3 do app); b (thinking natural), c (2507 sem think) e
    d (Gemma 4) não recebem o marcador."""
    base = read(os.path.join(HERE, "src", "clips",
                             "discover-prompt.txt" if kind == "discover" else "evaluate-prompt.txt"))
    if profile == "a":
        return base
    return base.replace(" /no_think", "").strip()


def speech_data(segs, ws, we):
    return {
        "minSeconds": MIN_S, "maxSeconds": MAX_S,
        "limit": PER_WINDOW_LIMIT,
        "speech": [[ws + j, s["start"], s["end"], s["text"]]
                   for j, s in enumerate(segs[ws:we])],
    }


def discover_schema(seg_max):
    return json.dumps({
        "type": "object", "additionalProperties": False, "required": ["candidates"],
        "properties": {"candidates": {"type": "array", "maxItems": MAX_TOTAL, "items": {
            "type": "object", "additionalProperties": False,
            "required": ["firstId", "lastId", "score"],
            "properties": {
                "firstId": {"type": "integer", "minimum": 0, "maximum": seg_max},
                "lastId": {"type": "integer", "minimum": 0, "maximum": seg_max},
                "score": {"type": "integer", "minimum": 0, "maximum": 100},
            }}}}})


def eval_schema(labels):
    return json.dumps({
        "type": "object", "additionalProperties": False, "required": ["items"],
        "properties": {"items": {"type": "array", "maxItems": len(labels), "items": {
            "type": "object", "additionalProperties": False,
            "required": ["id", "score", "reason"],
            "properties": {
                "id": {"type": "string", "enum": labels},
                "score": {"type": "integer", "minimum": 0, "maximum": 100},
                "reason": {"type": "string"},
            }}}}})


# ---- conform / repair / DP (equivalentes ao app: selection.rs) ----

def conform(first_id, last_id, score, segs, duration):
    """Retorna (start, end, score) se válido; None caso contrário.
    Equivale a selection.rs::conform (rejeita score>100, faixa min/max)."""
    if first_id > last_id or score > 100:
        return None
    if first_id >= len(segs) or last_id >= len(segs):
        return None
    start = segs[first_id]["start"]
    end = min(segs[last_id]["end"], duration)
    span = end - start
    if span < MIN_S or span > MAX_S:
        return None
    return (start, end, score)


def repair(first_id, last_id, score, segs, duration):
    """Alternativas 'início avançado'/'fim recuado'/'fim estendido'/'início
    recuado' — cópia das políticas de selection.rs::repair_alternatives.
    A nota da proposta é proveniência; a avaliação vem depois, própria."""
    alts = []
    if first_id > last_id or score > 100:
        return alts
    if first_id >= len(segs) or last_id >= len(segs):
        return alts
    first = segs[first_id]
    last = segs[last_id]
    natural_end = min(last["end"], duration)
    span = natural_end - first["start"]
    if span > MAX_S:
        floor = natural_end - MAX_S
        ceiling = natural_end - MIN_S
        for s in segs[:last_id + 1]:
            if floor <= s["start"] <= ceiling:
                if MIN_S <= natural_end - s["start"] <= MAX_S:
                    alts.append((s["start"], natural_end, score, "início avançado"))
                break
        for s in reversed(segs[first_id:]):
            e = min(s["end"], duration)
            if e - first["start"] <= MAX_S and e - first["start"] >= MIN_S:
                alts.append((first["start"], e, score, "fim recuado"))
                break
    elif span < MIN_S:
        for s in segs[first_id:]:
            e = min(s["end"], duration)
            if MIN_S <= e - first["start"] <= MAX_S:
                alts.append((first["start"], e, score, "fim estendido"))
                break
        floor = natural_end - MAX_S
        for s in reversed(segs[:last_id + 1]):
            if s["start"] >= floor and natural_end - s["start"] >= MIN_S:
                alts.append((s["start"], natural_end, score, "início recuado"))
                break
    return alts


def dp_select(clips, count):
    """DP weighted interval scheduling (max soma, depois cardinalidade,
    depois starts menores) — mesmo critério da atualização 5."""
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
                cand = (s + clips[idx]["score"], l + 1, g - clips[idx]["start"], path + [idx])
                if cur is None or cand[:3] > cur[:3]:
                    cur = cand
            best[i][k] = cur
    winner = None
    win_k = 0
    for k in range(count + 1):
        if best[n][k] is not None:
            if winner is None or best[n][k][0] > winner[0] or (best[n][k][0] == winner[0] and k > win_k):
                winner = best[n][k]
                win_k = k
    if winner is None:
        return []
    return [clips[i] for i in winner[3]]


# ---- estágios ----

def call_engine(profile, stem, prompt, schema, n_predict, use_grammar,
                engine_fn, calls_log, stage, ref):
    """Escreve artefatos, chama o motor e devolve (facts, stdout) + registro."""
    io.open(stem + "-prompt.txt", "w", encoding="utf-8", newline="").write(prompt)
    if schema is not None:
        io.open(stem + ".schema.json", "w", encoding="utf-8").write(schema)
    exe, argv = winfer.build_argv(profile, stem + "-prompt.txt",
                                  stem + ".schema.json" if schema is not None else None,
                                  n_predict, use_grammar)
    res = engine_fn(argv)
    io.open(stem + ".log", "w", encoding="utf-8").write(res["stderr"])
    io.open(stem + "-result.json", "w", encoding="utf-8").write(res["stdout"])
    facts = winfer.parse_log(res["stderr"])
    entry = {"stage": stage, "ref": ref, "argv": argv,
             "log": os.path.relpath(stem + ".log", HERE),
             "returncode": res["returncode"], "elapsed_s": res["elapsed_s"],
             "facts": facts, "ok": res["ok"]}
    calls_log.append(entry)
    return facts, res["stdout"], entry


def discovery_stage(profile, segs, windows, engine_fn, calls_log):
    """Descoberta: uma chamada POR JANELA, dentro do laço; acumula todos."""
    cfg = winfer.PROFILES[profile]
    system = system_for(profile, "discover")
    seg_max = len(segs) - 1
    schema = discover_schema(seg_max)
    results = []
    all_candidates = []
    for k, (ws, we) in enumerate(windows):
        data_str = json.dumps(speech_data(segs, ws, we), ensure_ascii=False).replace("<|", "< |")
        prompt = winfer.render_prompt(profile, system, data_str)
        stem = os.path.join(SCRATCH, f"discover-{profile}-w{k}")
        entry_window = {"window": [ws, we], "window_k": k}
        try:
            facts, stdout, entry = call_engine(
                profile, stem, prompt, schema, cfg["n_discovery"],
                cfg["grammar_discovery"], engine_fn, calls_log,
                "discovery", f"window-{k}")
            entry_window["facts"] = {"n_ctx": facts["n_ctx"],
                                     "prompt_tokens": facts["prompt_tokens"],
                                     "gen_tokens": facts["gen_tokens"]}
            reply = winfer.extract_json(stdout, cfg["thinking"])
            cands = reply.get("candidates", [])
            valid = [c for c in cands
                     if isinstance(c, dict)
                     and isinstance(c.get("firstId"), int)
                     and isinstance(c.get("lastId"), int)
                     and isinstance(c.get("score"), int)]
            entry_window["status"] = "ok"
            entry_window["propostas"] = len(cands)
            entry_window["invalidos_no_parse"] = len(cands) - len(valid)
            all_candidates.extend(valid)
        except Exception as exc:  # janela falha; as demais continuam
            entry_window["status"] = "failed"
            entry_window["error"] = f"{type(exc).__name__}: {exc}"
            for c in reversed(calls_log):
                if c["stage"] == "discovery" and c["ref"] == f"window-{k}":
                    c["failed"] = entry_window["error"]
                    break
        results.append(entry_window)
    return all_candidates, results


def build_clicks(candidates, segs, duration):
    """Dedupe por (firstId,lastId), aplica conform/repair com IDs globais."""
    seen = set()
    uniq = []
    for c in candidates:
        key = (c["firstId"], c["lastId"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(c)
    uniq = uniq[:MAX_TOTAL]
    built = []
    invalid = 0
    alternatives = 0
    for c in uniq:
        ok = conform(c["firstId"], c["lastId"], c["score"], segs, duration)
        if ok:
            built.append({"start": ok[0], "end": ok[1], "score": ok[2],
                          "razao": "", "origem": f"proposta [{c['firstId']},{c['lastId']}]"})
        else:
            invalid += 1
            for alt in repair(c["firstId"], c["lastId"], c["score"], segs, duration):
                built.append({"start": alt[0], "end": alt[1], "score": alt[2],
                              "razao": f"alternativa '{alt[3]}' de [{c['firstId']},{c['lastId']}]: "
                                       f"nota original é proveniência, não avaliação",
                              "origem": f"alternativa '{alt[3]}'"})
                alternatives += 1
    stats = {"propostas_unicas": len(uniq), "dedupe_removidos": len(candidates) - len(uniq),
             "fora_faixa": invalid, "alternativas": alternatives, "construidos": len(built)}
    return built, stats


def eval_batches_for(clips, exact_tokens_fn, budget_tokens):
    """Lotes de até EVAL_BATCH; subdivide lote cujo prompt exceda o orçamento
    (registro da subdivisão, ordem preservada)."""
    def expand(chunk, depth, out, records):
        labels = [f"E{i+1}" for i in range(len(chunk))]
        tokens = exact_tokens_fn(labels, chunk)
        if tokens <= budget_tokens or depth >= 3 or len(chunk) <= 1:
            if tokens > budget_tokens:
                records.append({"chunk": len(chunk), "tokens": tokens,
                                "action": "oversize-unresolvable"})
            out.append(chunk)
            return
        mid = len(chunk) // 2
        records.append({"chunk": len(chunk), "tokens": tokens,
                        "action": "subdivide", "parts": [mid, len(chunk) - mid]})
        expand(chunk[:mid], depth + 1, out, records)
        expand(chunk[mid:], depth + 1, out, records)

    final = []
    records = []
    for chunk in [clips[i:i + EVAL_BATCH] for i in range(0, len(clips), EVAL_BATCH)]:
        expand(chunk, 0, final, records)
    return final, records


def evaluation_stage(profile, segs, built, engine_fn, tokenizer_fn, calls_log, tok_cache):
    """Avaliação de TODOS os construídos pelo procedimento do próprio perfil.
    Falha de lote exclui aquele lote (sem fallback de notas antigas)."""
    cfg = winfer.PROFILES[profile]
    system = system_for(profile, "evaluate")
    budget = cfg["ctx"] - 4 - cfg["n_eval"] - CTX_MARGIN

    def make_prompt(labels, chunk):
        items = []
        for i, clip in enumerate(chunk):
            text = " ".join(s["text"] for s in segs
                            if s["start"] < clip["end"] and s["end"] > clip["start"])
            bef = nxt = None
            before_c = [s for s in segs if s["end"] <= clip["start"] + 1e-9]
            if before_c:
                bef = before_c[-1]["text"]
            after_c = [s for s in segs if s["start"] >= clip["end"] - 1e-9]
            if after_c:
                nxt = after_c[0]["text"]
            items.append({"id": labels[i], "start": clip["start"], "end": clip["end"],
                          "text": text, "contextBefore": bef, "contextAfter": nxt})
        data_str = json.dumps({"candidates": items}, ensure_ascii=False).replace("<|", "< |")
        return winfer.render_prompt(profile, system, data_str)

    def budget_of(labels, chunk):
        return tokenizer_fn(make_prompt(labels, chunk))

    chunks, subdiv = eval_batches_for(built, budget_of, budget)
    evaluated = []
    batch_reports = []
    for bi, chunk in enumerate(chunks):
        labels = [f"E{i+1}" for i in range(len(chunk))]
        prompt = make_prompt(labels, chunk)
        schema = eval_schema(labels)
        stem = os.path.join(SCRATCH, f"eval-{profile}-b{bi}")
        rep = {"batch": bi, "n": len(chunk)}
        try:
            facts, stdout, _ = call_engine(
                profile, stem, prompt, schema, cfg["n_eval"],
                cfg["grammar_eval"], engine_fn, calls_log,
                "evaluation", f"batch-{bi}")
            parsed = winfer.extract_json(stdout, cfg["thinking"])
            got = 0
            for item in parsed.get("items", []):
                try:
                    pos = int(str(item["id"]).strip("E")) - 1
                except (KeyError, ValueError):
                    continue
                if 0 <= pos < len(chunk):
                    c = dict(chunk[pos])
                    c["score"] = item["score"]
                    c["razao"] = item.get("reason", "")
                    evaluated.append(c)
                    got += 1
            rep["status"] = "ok" if got == len(chunk) else "partial"
            rep["avaliados"] = got
        except Exception as exc:
            rep["status"] = "failed"
            rep["error"] = f"{type(exc).__name__}: {exc}"
        batch_reports.append(rep)
    return evaluated, batch_reports, subdiv


def compute_status(disc_results, built_stats, eval_reports, evaluated, chosen_n):
    disc_failed = [r for r in disc_results if r["status"] != "ok"]
    eval_failed = [r for r in eval_reports if r["status"] == "failed"]
    eval_partial = [r for r in eval_reports if r["status"] == "partial"]
    if disc_results and all(r["status"] != "ok" for r in disc_results):
        return "EXECUÇÃO_FALHOU", ("todas as janelas de descoberta falharam: "
                                   + "; ".join(r.get("error", "?") for r in disc_failed))
    reasons = []
    if disc_failed:
        reasons.append(f"{len(disc_failed)} janela(s) de descoberta falharam "
                       f"(janelas {[r['window_k'] for r in disc_failed]})")
    if eval_failed:
        reasons.append(f"{len(eval_failed)} lote(s) de avaliação falharam "
                       f"(lotes {[r['batch'] for r in eval_failed]})")
    if eval_partial:
        reasons.append(f"{len(eval_partial)} lote(s) de avaliação parciais")
    if reasons:
        return "RESULTADO_PARCIAL", "; ".join(reasons)
    if built_stats["construidos"] == 0:
        return ("ANÁLISE_VÁLIDA_SEM_CANDIDATOS",
                "descoberta válida, mas nenhuma proposta resultou em corte construído")
    return "RESULTADO_COMPLETO", f"{chosen_n} cortes selecionados por DP"


def run_profile(profile, engine_fn=None, tokenizer_fn=None, emit=True):
    assert profile in winfer.PROFILES, f"perfil inválido: {profile}"
    cfg = winfer.PROFILES[profile]
    engine_fn = engine_fn or winfer.default_engine
    segs, duration = load_context()
    tok_cache = os.path.join(HERE, "scratch", f"tokcache-{profile}.json")
    runtime_model = cfg["model"] if os.path.isabs(cfg["model"]) else os.path.join(cfg["runtime"], cfg["model"])

    def real_tokenizer(text):
        count, _ = winfer.default_tokenizer(cfg["runtime"], runtime_model, text, tok_cache)
        return count

    tokenizer_fn = tokenizer_fn or real_tokenizer
    calls_log = []

    # --- planejamento: orçamento comum = mais restritivo entre perfis
    budgets = {p: winfer.PROFILES[p]["ctx"] - 4 - winfer.PROFILES[p]["n_discovery"] - CTX_MARGIN
               for p in winfer.PROFILES}
    budget = min(budgets.values())
    system = system_for(profile, "discover")

    def full_data_str():
        return json.dumps(speech_data(segs, 0, len(segs)), ensure_ascii=False).replace("<|", "< |")

    full_prompt = winfer.render_prompt(profile, system, full_data_str())
    full_chars = len(full_prompt)
    full_tokens = tokenizer_fn(full_prompt)
    ratio = wplan.estimate_ratio(full_chars, full_tokens)

    def prompt_chars(ws, we):
        data_str = json.dumps(speech_data(segs, ws, we), ensure_ascii=False).replace("<|", "< |")
        return len(winfer.render_prompt(profile, system, data_str))

    planned = wplan.plan_windows(segs, prompt_chars, budget, ratio)

    def exact_tokens(ws, we):
        data_str = json.dumps(speech_data(segs, ws, we), ensure_ascii=False).replace("<|", "< |")
        return tokenizer_fn(winfer.render_prompt(profile, system, data_str))

    windows, subdiv_records = wplan.verify_and_subdivide(planned, exact_tokens, budget)
    cov = wplan.coverage(segs, windows)
    if cov["gaps"]:
        raise RuntimeError(f"lacuna de cobertura: segmentos {cov['gaps'][:10]}")

    # --- orçamento declarado ANTES da execução. A avaliação considera o pior
    # caso com alternativas de repair (proposta fora da faixa pode gerar até 2):
    max_built = MAX_TOTAL + 2 * MAX_TOTAL
    planned_eval = -(-max_built // EVAL_BATCH)
    budget_decl = {
        "prova_curta": 1, "descoberta": len(windows),
        "avaliacao_max": planned_eval,
        "total_max": 1 + len(windows) + planned_eval,
        "nota": "uma passada; repetição só por falha técnica nova, registrada",
    }
    if emit:
        print(f"[{profile}] orçamento declarado: {budget_decl}")

    # --- descoberta (uma chamada POR janela, dentro do laço)
    candidates, disc_results = discovery_stage(profile, segs, windows, engine_fn, calls_log)
    built, build_stats = build_clicks(candidates, segs, duration)

    # --- avaliação
    if built:
        evaluated, eval_reports, eval_subdiv = evaluation_stage(
            profile, segs, built, engine_fn, tokenizer_fn, calls_log, tok_cache)
    else:
        evaluated, eval_reports, eval_subdiv = [], [], []

    # --- seleção final (DP: sem sobreposição, contagem limitada no código)
    evaluated.sort(key=lambda c: (-c["score"], c["start"]))
    chosen = dp_select(evaluated, COUNT)
    for c in chosen:
        texts = [s["text"] for s in segs if s["start"] < c["end"] and s["end"] > c["start"]]
        c["abertura"] = texts[0] if texts else ""
        c["fechamento"] = texts[-1] if texts else ""

    status, motivo = compute_status(disc_results, build_stats, eval_reports,
                                    evaluated, len(chosen))
    disc_s = sum(c["elapsed_s"] for c in calls_log if c["stage"] == "discovery")
    eval_s = sum(c["elapsed_s"] for c in calls_log if c["stage"] == "evaluation")

    report = {
        "perfil": profile,
        "modelo": cfg["desc"],
        "config": {
            "template": cfg["template"], "ctx_solicitado": cfg["ctx"],
            "seed": cfg["seed"], "thinking": cfg["thinking"],
            "sampling": cfg["sampling"], "sampling_source": cfg["sampling_source"],
            "grammar_discovery": cfg["grammar_discovery"],
            "grammar_eval": cfg["grammar_eval"],
            "n_discovery": cfg["n_discovery"], "n_eval": cfg["n_eval"],
            "ngl": "auto do runtime (sem --fit)",
        },
        "janelas": {
            "budget_prompt_tokens": budget,
            "calibracao": {"prompt_completo_chars": full_chars,
                           "prompt_completo_tokens": full_tokens,
                           "chars_por_token": round(ratio, 4)},
            "planejadas": planned, "verificadas": windows,
            "subdivisoes": subdiv_records, "cobertura": {
                "gaps": cov["gaps"], "min_cover": cov["min_cover"],
                "max_cover": cov["max_cover"], "overlaps": cov["overlaps"]},
            "por_janela_tokens": [exact_tokens(ws, we) for ws, we in windows],
        },
        "orcamento": {"declarado": budget_decl,
                      "executado": {
                          "descoberta": sum(1 for c in calls_log if c["stage"] == "discovery"),
                          "avaliacao": sum(1 for c in calls_log if c["stage"] == "evaluation")},
                      "total_llm": len(calls_log)},
        "chamadas": calls_log,
        "descoberta": {"por_janela": disc_results, **build_stats},
        "avaliacao": {"lotes": eval_reports, "subdivisoes": eval_subdiv,
                      "avaliados": len(evaluated), "construidos": len(built)},
        "tempos": {"descoberta_s": round(disc_s, 1), "avaliacao_s": round(eval_s, 1),
                   "total_s": round(disc_s + eval_s, 1)},
        "resultado": {"status": status, "motivo": motivo, "clips": chosen},
    }
    dest = os.path.join(REPORTS, f"discover-{profile}.json")
    if emit:
        io.open(dest, "w", encoding="utf-8").write(json.dumps(report, ensure_ascii=False, indent=1))
        print(f"[{profile}] status={status} — {len(chosen)} cortes → {dest}")
    return report


def prove(profile, engine_fn=None, tokenizer_fn=None, emit=True):
    """Prova curta (item 3): valida template, JSON, n_ctx/sampler efetivos,
    thinking×grammar — ANTES do episódio. UMA chamada."""
    cfg = winfer.PROFILES[profile]
    engine_fn = engine_fn or winfer.default_engine
    segs, _ = load_context()
    runtime_model = cfg["model"] if os.path.isabs(cfg["model"]) else os.path.join(cfg["runtime"], cfg["model"])
    tok_cache = os.path.join(HERE, "scratch", f"tokcache-{profile}.json")

    def real_tokenizer(text):
        count, _ = winfer.default_tokenizer(cfg["runtime"], runtime_model, text, tok_cache)
        return count

    tokenizer_fn = tokenizer_fn or real_tokenizer
    system = system_for(profile, "discover")
    data_str = json.dumps(speech_data(segs, 0, 8), ensure_ascii=False).replace("<|", "< |")
    prompt = winfer.render_prompt(profile, system, data_str)
    tokens = tokenizer_fn(prompt)
    schema = discover_schema(len(segs) - 1)
    stem = os.path.join(SCRATCH, f"prove-{profile}")
    calls = []
    try:
        facts, stdout, entry = call_engine(
            profile, stem, prompt, schema,
            # b usa o orçamento REAL do perfil: a 1ª prova (n=1200) truncou o
            # raciocínio no meio (evidência registrada); repetição única.
            cfg["n_discovery"] if profile == "b" else min(cfg["n_discovery"], 600),
            cfg["grammar_discovery"], engine_fn, calls, "prove", "curta")
    except Exception as exc:
        result = {"perfil": profile, "prova_ok": False,
                  "problemas": [f"chamada falhou: {type(exc).__name__}: {exc}"],
                  "checks": {"tokens_prompt_medido": tokens}}
        if emit:
            io.open(os.path.join(REPORTS, f"prove-{profile}.json"), "w", encoding="utf-8").write(
                json.dumps(result, ensure_ascii=False, indent=1))
            print(f"[prove-{profile}] REPROVADA: {result['problemas']}")
        return result

    checks = {"tokens_prompt_medido": tokens,
              "tokens_prompt_log": facts["prompt_tokens"],
              "n_ctx_log": facts["n_ctx"], "n_ctx_esperado": cfg["ctx"],
              "sampler_log": facts["sampler"]}
    prova_ok = True
    problemas = []
    if facts["n_ctx"] != cfg["ctx"]:
        prova_ok = False
        problemas.append(f"n_ctx carregado {facts['n_ctx']} ≠ solicitado {cfg['ctx']}")
    want_temp = cfg["sampling"]["temp"]
    got_temp = facts["sampler"].get("temp")
    if got_temp is not None and abs(got_temp - want_temp) > 1e-6:
        prova_ok = False
        problemas.append(f"temp efetiva {got_temp} ≠ configurada {want_temp}")
    try:
        reply = winfer.extract_json(stdout, cfg["thinking"])
        checks["json_ok"] = True
        checks["candidates_campos"] = sorted(reply.keys()) if isinstance(reply, dict) else None
    except ValueError as exc:
        prova_ok = False
        problemas.append(f"JSON final inválido: {exc}")
        checks["json_ok"] = False
    if cfg["thinking"] == "natural":
        has_think = "</think>" in stdout
        checks["thinking_presente"] = has_think
        if not has_think:
            # limite de raciocínio atingido: registrar como tal
            checks["thinking_ate_limite"] = True
            problemas.append("resposta sem </think> dentro do orçamento (limite de raciocínio?)")
    if profile == "d":
        checks["thought_block_residual"] = "<|channel>thought" in stdout
        n_limit = int(entry["argv"][entry["argv"].index("-n") + 1])
        checks["terminou_antes_do_limite"] = (facts["gen_tokens"] or 0) < n_limit
    result = {"perfil": profile, "prova_ok": prova_ok, "problemas": problemas,
              "checks": checks, "facts": facts,
              "stdout_primeiros_200": stdout[:200]}
    if emit:
        io.open(os.path.join(REPORTS, f"prove-{profile}.json"), "w", encoding="utf-8").write(
            json.dumps(result, ensure_ascii=False, indent=1))
        print(f"[prove-{profile}] {'OK' if prova_ok else 'REPROVADA'}: {problemas or 'todos os checks passaram'}")
    return result


def plan_only(profile, tokenizer_fn=None, emit=True):
    """Dimensiona janelas com o tokenizador REAL — nenhuma chamada LLM.
    Devolve o mapa para declaração prévia do orçamento."""
    cfg = winfer.PROFILES[profile]
    segs, _ = load_context()
    runtime_model = cfg["model"] if os.path.isabs(cfg["model"]) else os.path.join(cfg["runtime"], cfg["model"])
    tok_cache = os.path.join(HERE, "scratch", f"tokcache-{profile}.json")
    if tokenizer_fn is None:
        def tokenizer_fn(text):
            count, _ = winfer.default_tokenizer(cfg["runtime"], runtime_model, text, tok_cache)
            return count
    budgets = {p: winfer.PROFILES[p]["ctx"] - 4 - winfer.PROFILES[p]["n_discovery"] - CTX_MARGIN
               for p in winfer.PROFILES}
    budget = min(budgets.values())
    system = system_for(profile, "discover")

    def data_str_of(ws, we):
        return json.dumps(speech_data(segs, ws, we), ensure_ascii=False).replace("<|", "< |")

    full_prompt = winfer.render_prompt(profile, system, data_str_of(0, len(segs)))
    full_tokens = tokenizer_fn(full_prompt)
    ratio = wplan.estimate_ratio(len(full_prompt), full_tokens)

    def prompt_chars(ws, we):
        return len(winfer.render_prompt(profile, system, data_str_of(ws, we)))

    planned = wplan.plan_windows(segs, prompt_chars, budget, ratio)

    def exact_tokens(ws, we):
        return tokenizer_fn(winfer.render_prompt(profile, system, data_str_of(ws, we)))

    windows, records = wplan.verify_and_subdivide(planned, exact_tokens, budget)
    cov = wplan.coverage(segs, windows)
    out = {
        "perfil": profile, "budget_prompt_tokens": budget,
        "prompt_completo_tokens": full_tokens,
        "janelas_planejadas": planned, "janelas_verificadas": windows,
        "tokens_por_janela": [exact_tokens(ws, we) for ws, we in windows],
        "subdivisoes": records,
        "cobertura": {"gaps": cov["gaps"], "overlaps": cov["overlaps"]},
        "custa_llm": 0,
    }
    if emit:
        print(f"[plan-{profile}] prompt completo={full_tokens} tokens; orçamento/janela={budget}")
        for (ws, we), tok in zip(windows, out["tokens_por_janela"]):
            seg = segs[ws]
            seg2 = segs[we - 1]
            print(f"  janela [{ws},{we}) {seg['start']:.1f}s–{seg2['end']:.1f}s → {tok} tokens")
        if cov["gaps"]:
            print(f"  LACUNAS: {cov['gaps']}")
    return out


def main():
    profile = "a"
    mode = "run"
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--profile" and i + 1 < len(args):
            profile = args[i + 1]
        if arg == "--prove":
            mode = "prove"
        if arg == "--plan":
            mode = "plan"
    if mode == "prove":
        prove(profile)
    elif mode == "plan":
        plan_only(profile)
    else:
        run_profile(profile)


if __name__ == "__main__":
    main()
