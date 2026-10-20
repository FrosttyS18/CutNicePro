#!/usr/bin/env python3
"""Planejamento de janelas por ORÇAMENTO DE TOKENS do prompt final.

Política (tarefa de retomada, item 2):
- dimensionar pelo prompt FINAL tokenizado (template + dados + reservas),
  nunca por número fixo de falas;
- sobreposição de fronteira (≈90 s, como a produção) para que histórias que
  atravessam bordas tenham contexto;
- cobertura sem lacunas silenciosas (todo segmento em ≥1 janela);
- janela que não cabe → subdivisão delimitada e registrada (nunca truncar,
  nunca repetir indefinidamente a mesma entrada).
Funções puras com estimador/tokenizador injetáveis (testes sem inferência).
"""


def estimate_ratio(calibration_chars, calibration_tokens):
    if calibration_chars <= 0:
        raise ValueError("calibração sem caracteres")
    return calibration_tokens / calibration_chars


def plan_windows(segs, prompt_chars_fn, budget_tokens, chars_per_token,
                 min_overlap_s=90.0):
    """Janelas (start_i, end_i) por estimativa de tokens; greedy.
    prompt_chars_fn(ws, we) devolve o nº de chars do prompt FINAL da janela
    (template + JSON com [id,start,end,texto] globais)."""
    windows = []
    start_i = 0
    n = len(segs)
    while start_i < n:
        end_i = start_i
        while end_i < n:
            est = prompt_chars_fn(start_i, end_i + 1) * chars_per_token
            if est > budget_tokens and end_i > start_i:
                break
            end_i += 1
        end_i = min(end_i, n)
        windows.append((start_i, end_i))
        if end_i >= n:
            break
        span = segs[end_i - 1]["end"] - segs[start_i]["start"]
        boundary = segs[end_i - 1]["end"] - min(min_overlap_s, span / 2.0)
        nxt = next((i for i in range(start_i + 1, end_i) if segs[i]["start"] >= boundary), end_i)
        start_i = nxt
    return windows


def coverage(segs, windows):
    """Mapa de cobertura: contagem por segmento, sobreposições e lacunas."""
    counts = [0] * len(segs)
    for ws, we in windows:
        for i in range(ws, we):
            counts[i] += 1
    gaps = [i for i, c in enumerate(counts) if c == 0]
    overlaps = []
    for idx in range(1, len(windows)):
        prev_end = windows[idx - 1][1]
        cur_start = windows[idx][0]
        if cur_start < prev_end:
            overlaps.append({
                "from_seg": cur_start, "to_seg": prev_end - 1,
                "from_s": segs[cur_start]["start"],
                "to_s": segs[prev_end - 1]["end"],
            })
    return {"counts": counts, "gaps": gaps, "overlaps": overlaps,
            "min_cover": min(counts) if counts else 0,
            "max_cover": max(counts) if counts else 0}


def verify_and_subdivide(windows, exact_tokens_fn, budget_tokens, max_depth=4):
    """Verifica cada janela com o tokenizador REAL e subdivide as que
    excederem o orçamento. Devolve (janelas_finais, registros).
    Nunca trunca; falha registrada se não couber nem na profundidade máxima."""
    final = []
    records = []

    def split(ws, we, depth):
        records.append({"window": [ws, we], "depth": depth,
                        "action": "verify"})
        tokens = exact_tokens_fn(ws, we)
        rec = {"window": [ws, we], "tokens": tokens, "depth": depth}
        if tokens <= budget_tokens:
            rec["action"] = "ok"
            records.append(rec)
            final.append((ws, we))
            return
        if depth >= max_depth or we - ws <= 1:
            rec["action"] = "oversize-unresolvable"
            records.append(rec)
            return
        mid = (ws + we) // 2
        rec["action"] = "subdivide"
        rec["parts"] = [[ws, mid], [mid, we]]
        records.append(rec)
        split(ws, mid, depth + 1)
        split(mid, we, depth + 1)

    for ws, we in windows:
        split(ws, we, 0)
    final.sort()
    return final, records
