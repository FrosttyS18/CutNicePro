#!/usr/bin/env python3
"""Descoberta por unidades narrativas — atualização 6.
Cada perfil lê a transcrição inteira e gera SEUS candidatos; todos
recebem avaliação pelo perfil (sem mistura de notas). DP para seleção.
Executável standalone (mesma lógica de conform/repair/avaliação/DP do app).
Uso: python tools/discover.py [--profile a|b|c|d]
"""
import json, io, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = os.path.join(HERE, "scratch")
REPORTS = os.path.join(HERE, "reports")
DATA = os.path.join(HERE, "data")

ENGINES = {
    "a": (r"C:\CutNicePro\.tooling\vendor\analysis", "Qwen3-4B-Q4_K_M.gguf"),
    "b": (r"C:\CutNicePro\.tooling\vendor\analysis", "Qwen3-4B-Q4_K_M.gguf"),
    "c": (os.path.join(HERE, "models", "home-c"), "Qwen3-4B-Q4_K_M.gguf"),
    "d": (os.path.join(HERE, "models", "home-d"), "gemma-3-12b-it-Q4_K_M.gguf"),
}

def read(p):
    return io.open(p, encoding="utf-8").read()

def first_json(s):
    d = json.JSONDecoder()
    obj, _ = d.raw_decode(s.strip())
    return obj

def run_llama(home, model, prompt_path, schema_path, tokens, use_grammar, ctx=8192):
    exe = os.path.join(home, "gpu", "llama-completion.exe")
    if not os.path.isfile(exe):
        exe = os.path.join(home, "bin", "llama-completion.exe")
    model_path = os.path.join(home, model)
    cmd = [exe, "-m", model_path, "-f", prompt_path,
           "-t", "8", "-c", str(ctx), "-n", str(tokens), "--temp", "0",
           "--no-conversation", "--no-display-prompt", "--no-escape",
           "--simple-io", "--verbosity", "3"]
    if use_grammar and schema_path:
        cmd.extend(["-jf", schema_path])
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    elapsed = time.time() - t0
    return proc, elapsed

def parse_tokens(log):
    pt = gt = None
    for line in log.splitlines():
        if "prompt eval time" in line:
            m = re.search(r"/ +(\d+) tokens", line)
            if m: pt = int(m.group(1))
        elif "eval time" in line and " runs" in line:
            m = re.search(r"/ +(\d+) runs", line)
            if m: gt = int(m.group(1))
    return pt, gt

def discover_prompt(profile, system, data_str):
    """Monta o prompt no formato do perfil."""
    if profile == "a":
        return (f"<|im_start|>system\n{system}<|im_end|>\n"
                f"<|im_start|>user\n{data_str}<|im_end|>\n"
                f"<|im_start|>assistant\n<think>\n\n</think>\n\n")
    # b/c/d: sem think preenchido
    return (f"<|im_start|>system\n{system}<|im_end|>\n"
            f"<|im_start|>user\n{data_str}<|im_end|>\n"
            f"<|im_start|>assistant\n")

def conform(first_id, last_id, score, segs, duration, min_s, max_s):
    """Retorna (start, end) se válido; None se fora da faixa."""
    if first_id > last_id or first_id >= len(segs) or last_id >= len(segs):
        return None
    start = segs[first_id]["start"]
    end = min(segs[last_id]["end"], duration)
    span = end - start
    if span < min_s or span > max_s:
        return None
    return (start, end, score)

def repair(first_id, last_id, score, segs, duration, min_s, max_s):
    """Gera alternativas válidas para proposta fora da faixa."""
    alts = []
    if first_id > last_id or first_id >= len(segs) or last_id >= len(segs):
        return alts
    first = segs[first_id]; last = segs[last_id]
    natural_end = min(last["end"], duration)
    span = natural_end - first["start"]
    if span > max_s:
        # início avançado (preserva desfecho)
        floor = natural_end - max_s
        ceiling = natural_end - min_s
        for s in segs[:last_id + 1]:
            if floor <= s["start"] <= ceiling:
                end_span = natural_end - s["start"]
                if min_s <= end_span <= max_s:
                    alts.append((s["start"], natural_end, score, "início avançado"))
                break
        # fim recuado (preserva abertura)
        for s in reversed(segs[first_id:]):
            e = min(s["end"], duration)
            if e - first["start"] <= max_s and e - first["start"] >= min_s:
                alts.append((first["start"], e, score, "fim recuado"))
                break
    elif span < min_s:
        # fim estendido
        for s in segs[first_id:]:
            e = min(s["end"], duration)
            if e - first["start"] >= min_s and e - first["start"] <= max_s:
                alts.append((first["start"], e, score, "fim estendido"))
                break
        # início recuado
        floor = natural_end - max_s
        for s in reversed(segs[:last_id + 1]):
            if s["start"] >= floor and natural_end - s["start"] >= min_s:
                alts.append((s["start"], natural_end, score, "início recuado"))
                break
    return alts

def dp_select(clips, count):
    """DP weighted interval scheduling (max soma, depois cardinalidade)."""
    n = len(clips)
    if n == 0 or count == 0:
        return []
    order = sorted(range(n), key=lambda i: (clips[i]["end"], clips[i]["start"]))
    # best[i][k] = (soma, cardinalidade, -starts, caminho)
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
    winner = None; win_k = 0
    for k in range(count + 1):
        if best[n][k] is not None:
            if winner is None or best[n][k][0] > winner[0] or (best[n][k][0] == winner[0] and k > win_k):
                winner = best[n][k]; win_k = k
    if winner is None:
        return []
    return [clips[i] for i in winner[3]]

def main():
    profile = "a"
    for i, arg in enumerate(sys.argv):
        if arg == "--profile" and i + 1 < len(sys.argv):
            profile = sys.argv[i + 1]
    assert profile in ENGINES, f"perfil {profile} inválido"

    transcript = json.loads(read(os.path.join(DATA, "transcript-davyjones.json")))
    segs = transcript["segments"]
    duration = float(read(os.path.join(DATA, "media-duration.txt")).strip())
    MIN, MAX, COUNT = 15.0, 90.0, 3

    home, model = ENGINES[profile]
    system = read(os.path.join(HERE, "src", "clips", "discover-prompt.txt"))
    if profile != "a":
        system = system.replace(" /no_think", "").strip()
    # janelas (como produção): ~18k chars por janela com overlap
    win_size = 259
    windows = []
    start_i = 0
    while start_i < len(segs):
        end_i = min(start_i + win_size, len(segs))
        windows.append((start_i, end_i))
        if end_i == len(segs): break
        # avança com overlap de ~90 segmentos (como max_seconds da produção)
        boundary = segs[end_i-1]["end"] - min(90.0, (segs[end_i-1]["end"] - segs[start_i]["start"]) / 2.0)
        start_i = next((i for i in range(start_i+1, end_i) if segs[i]["start"] >= boundary), end_i)
    print(f"[discover-{profile}] {len(windows)} janelas: {windows}")
    all_candidates = []
    for wi, (ws, we) in enumerate(windows):
        win_segs = segs[ws:we]
        data = {
            "minSeconds": MIN, "maxSeconds": MAX, "limit": min(COUNT * 2, 12),
            "speech": [[ws + j, s["start"], s["end"], s["text"]] for j, s in enumerate(win_segs)],
        }
    data_str = json.dumps(data, ensure_ascii=False).replace("<|", "< |")
    prompt = discover_prompt(profile, system, data_str)
    seg_max = len(segs) - 1
    schema = json.dumps({
        "type": "object", "additionalProperties": False, "required": ["candidates"],
        "properties": {"candidates": {"type": "array", "maxItems": 12, "items": {
            "type": "object", "additionalProperties": False,
            "required": ["firstId", "lastId", "score"],
            "properties": {
                "firstId": {"type": "integer", "minimum": 0, "maximum": seg_max},
                "lastId": {"type": "integer", "minimum": 0, "maximum": seg_max},
                "score": {"type": "integer", "minimum": 0, "maximum": 100},
            }}}}})

    stem = os.path.join(SCRATCH, f"discover-{profile}")
    io.open(stem + "-prompt.txt", "w", encoding="utf-8").write(prompt)
    io.open(stem + ".schema.json", "w", encoding="utf-8").write(schema)

    use_grammar = profile != "b"
    max_tokens = 3000 if profile == "b" else 2000
    print(f"[discover-{profile}] descoberta (grammar={use_grammar}, model={model})...")
    proc, disc_s = run_llama(home, model, stem + "-prompt.txt", stem + ".schema.json", max_tokens, use_grammar)
    stdout = proc.stdout.strip()
    stderr = proc.stderr
    io.open(stem + ".log", "w", encoding="utf-8").write(stderr)
    io.open(stem + "-result.json", "w", encoding="utf-8").write(stdout)
    disc_ptok, disc_gtok = parse_tokens(stderr)

    raw = stdout.split("</think>")[-1].strip() if profile == "b" else stdout
    try:
        reply = first_json(raw)
        candidates = reply.get("candidates", [])
    except (json.JSONDecodeError, ValueError):
        print(f"[discover-{profile}] RESPOSTA INVÁLIDA: {raw[:200]}")
        candidates = []
    print(f"[discover-{profile}] {len(candidates)} propostas em {disc_s:.1}s (ptok={disc_ptok} gtok={disc_gtok})")

    # construir
    all_clips = []
    invalid = 0
    for c in candidates[:12]:
        result = conform(c["firstId"], c["lastId"], c["score"], segs, duration, MIN, MAX)
        if result:
            all_clips.append({"start": result[0], "end": result[1], "score": result[2], "razao": ""})
        else:
            invalid += 1
            for alt in repair(c["firstId"], c["lastId"], c["score"], segs, duration, MIN, MAX):
                all_clips.append({"start": alt[0], "end": alt[1], "score": alt[2], "razao": f"alternativa '{alt[3]}'"})
    print(f"[discover-{profile}] {invalid} fora da faixa; {len(all_clips)} construídos")

    # avaliar TODOS em lotes de 8
    eval_t0 = time.time()
    eval_system = read(os.path.join(HERE, "src", "clips", "evaluate-prompt.txt"))
    if profile != "a":
        eval_system = eval_system.replace(" /no_think", "").strip()
    evaluated = []
    for ci, chunk in enumerate([all_clips[i:i+8] for i in range(0, len(all_clips), 8)]):
        labels = [f"E{i+1}" for i in range(len(chunk))]
        items = []
        for i, clip in enumerate(chunk):
            text = " ".join(s["text"] for s in segs if s["start"] < clip["end"] and s["end"] > clip["start"])
            bef = next_back = None
            before_cands = [s for s in segs if s["end"] <= clip["start"] + 1e-9]
            if before_cands: bef = before_cands[-1]["text"]
            after_cands = [s for s in segs if s["start"] >= clip["end"] - 1e-9]
            if after_cands: next_back = after_cands[0]["text"]
            items.append({"id": labels[i], "start": clip["start"], "end": clip["end"],
                          "text": text, "contextBefore": bef, "contextAfter": next_back})
        eval_data = json.dumps({"candidates": items}, ensure_ascii=False).replace("<|", "< |")
        think_eval = "<think>\n\n</think>\n\n" if profile == "a" else ""
        eval_prompt = f"<|im_start|>system\n{eval_system}<|im_end|>\n<|im_start|>user\n{eval_data}<|im_end|>\n<|im_start|>assistant\n{think_eval}"
        eval_schema = json.dumps({
            "type": "object", "additionalProperties": False, "required": ["items"],
            "properties": {"items": {"type": "array", "maxItems": len(chunk), "items": {
                "type": "object", "additionalProperties": False,
                "required": ["id", "score", "reason"],
                "properties": {
                    "id": {"type": "string", "enum": labels},
                    "score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "reason": {"type": "string"},
                }}}}})
        es = os.path.join(SCRATCH, f"eval-{profile}-{ci}")
        io.open(es + "-prompt.txt", "w", encoding="utf-8").write(eval_prompt)
        io.open(es + ".schema.json", "w", encoding="utf-8").write(eval_schema)
        eproc, _ = run_llama(home, model, es + "-prompt.txt", es + ".schema.json", 2400, True)
        eraw = eproc.stdout.strip()
        io.open(es + ".log", "w", encoding="utf-8").write(eproc.stderr)
        io.open(es + "-result.json", "w", encoding="utf-8").write(eraw)
        try:
            parsed = first_json(eraw)
            for item in parsed.get("items", []):
                pos = int(item["id"].strip("E")) - 1
                if 0 <= pos < len(chunk):
                    c = dict(chunk[pos])
                    c["score"] = item["score"]
                    c["razao"] = item.get("reason", "")
                    evaluated.append(c)
        except (json.JSONDecodeError, ValueError, KeyError):
            print(f"[discover-{profile}] lote {ci} FALHOU")
    eval_s = time.time() - eval_t0
    print(f"[discover-{profile}] {len(evaluated)}/{len(all_clips)} avaliados em {eval_s:.1}s")

    # DP
    evaluated.sort(key=lambda c: (-c["score"], c["start"]))
    chosen = dp_select(evaluated, COUNT)
    total_s = disc_s + eval_s

    # aberturas e fechamentos
    for c in chosen:
        texts = [s["text"] for s in segs if s["start"] < c["end"] and s["end"] > c["start"]]
        c["abertura"] = texts[0] if texts else ""
        c["fechamento"] = texts[-1] if texts else ""

    model_desc = {"a": "Qwen3 4B Instruct Awq (vendor)", "b": "Qwen3 4B Instruct Awq (vendor)",
                  "c": "Qwen3-4B-Instruct-2507", "d": "Gemma-3-12B-IT Q4_K_M"}[profile]
    config_desc = {"a": "non-thinking: think vazio + /no_think + grammar",
                   "b": "thinking NATURAL: sem think preenchido, SEM grammar na descoberta (-n 3000), parse pós-</think>",
                   "c": "template 2507 Instruct (sem think), grammar",
                   "d": "template Gemma 3 IT, grammar"}[profile]

    report = {
        "perfil": profile, "modelo": model_desc, "config": config_desc,
        "propostas": len(candidates), "fora_faixa": invalid,
        "construidos": len(all_clips), "avaliados": len(evaluated),
        "descoberta_s": round(disc_s, 1), "avaliacao_s": round(eval_s, 1), "total_s": round(total_s, 1),
        "descoberta_tokens": {"prompt": disc_ptok, "geracao": disc_gtok},
        "clips": chosen,
    }
    dest = os.path.join(REPORTS, f"discover-{profile}.json")
    io.open(dest, "w", encoding="utf-8").write(json.dumps(report, ensure_ascii=False, indent=1))
    print(f"[discover-{profile}] CONCLUÍDO: {len(chosen)} cortes em {total_s:.1}s → {dest}")

if __name__ == "__main__":
    main()
