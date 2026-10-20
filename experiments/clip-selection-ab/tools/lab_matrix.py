#!/usr/bin/env python3
"""Matriz A/B/C do laboratório (atualização 4) — delimitada e finita.

Perfis: A vigente (think vazio + /no_think, modelo instalado);
B template oficial do Instruct (sem think//no_think, mesmo modelo);
C mesmo formato de B com Qwen3-4B-Instruct-2507 (home isolado em models/home-c).
Casos: 1 controle de instrução; 2 avaliação integral de 3 candidatos reais;
3 rerank integral dos 12 candidatos reais. temp=0, 1 execução por célula
(sem amostragem). Falhas contam como resultado. Saída: reports/lab-matrix.json
+ brutos em scratch/lab-{perfil}-{caso}.*
"""
import io, json, os, re, struct, subprocess, sys, time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = r"C:\CutNicePro\.tooling\vendor\analysis"
HOME_C = os.path.join(HERE, "models", "home-c")
SCRATCH = os.path.join(HERE, "scratch")
REPORTS = os.path.join(HERE, "reports")
DATA = os.path.join(HERE, "data")

def read(p):
    return io.open(p, encoding="utf-8").read()

def gguf_name(path):
    f = open(path, "rb")
    assert f.read(4) == b"GGUF"
    struct.unpack("<I", f.read(4)); struct.unpack("<Q", f.read(8))
    n_kv = struct.unpack("<Q", f.read(8))[0]
    def rstr():
        n = struct.unpack("<Q", f.read(8))[0]; return f.read(n).decode("utf-8", "replace")
    for _ in range(n_kv):
        k = rstr(); t = struct.unpack("<I", f.read(4))[0]
        if t == 8:
            v = rstr()
            if k == "general.name": return v
        elif t == 9:
            n = struct.unpack("<I", f.read(4))[0]; et = struct.unpack("<I", f.read(4))[0]
            skip = {0:1,1:1,2:2,3:2,4:4,5:4,6:4,7:1,10:8,11:8,12:8}
            if et in skip: f.seek(skip[et]*min(n, 10**9), 1)
            elif et == 8:
                for _ in range(n):
                    ln = struct.unpack("<Q", f.read(8))[0]; f.seek(ln, 1)
            else: raise ValueError(et)
        else:
            SZ={0:1,1:1,2:2,3:2,4:4,5:4,6:4,7:1,10:8,11:8,12:8}
            f.seek(SZ[t], 1)
    return "?"

def build_prompt(profile, system, data_str):
    if profile == "a":
        return (f"<|im_start|>system\n{system}<|im_end|>\n"
                f"<|im_start|>user\n{data_str}<|im_end|>\n"
                f"<|im_start|>assistant\n<think>\n\n</think>\n\n")
    return (f"<|im_start|>system\n{system}<|im_end|>\n"
            f"<|im_start|>user\n{data_str}<|im_end|>\n"
            f"<|im_start|>assistant\n")

def run(profile, case, system, data, schema, tokens):
    home = VENDOR if profile in "ab" else HOME_C
    model = os.path.join(home, "Qwen3-4B" + ("-Instruct-2507-" if profile == "c" else "-") + "Q4_K_M.gguf")
    if profile == "c":
        model = os.path.join(HOME_C, "Qwen3-4B-Instruct-2507-Q4_K_M.gguf")
    else:
        model = os.path.join(VENDOR, "Qwen3-4B-Q4_K_M.gguf")
    exe = os.path.join(home, "gpu", "llama-completion.exe")
    if not os.path.isfile(exe):
        exe = os.path.join(home, "bin", "llama-completion.exe")
    stem = os.path.join(SCRATCH, f"lab-{profile}-{case}")
    prompt = build_prompt(profile, system, data.replace("<|", "< |"))
    io.open(stem + "-prompt.txt", "w", encoding="utf-8").write(prompt)
    io.open(stem + ".schema.json", "w", encoding="utf-8").write(json.dumps(schema))
    cmd = [exe, "-m", model, "-f", stem + "-prompt.txt", "-jf", stem + ".schema.json",
           "-ngl", "auto", "-t", "8", "-c", "8192", "-n", str(tokens), "--temp", "0",
           "--no-conversation", "--no-display-prompt", "--no-escape", "--simple-io",
           "--verbosity", "3", "--fit", "on", "--fit-target", "1024"]
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=420)
    elapsed = round(time.time() - t0, 1)
    log = proc.stderr or ""
    io.open(stem + ".log", "w", encoding="utf-8").write(log)
    raw = (proc.stdout or "").strip()
    if raw:
        io.open(stem + "-result.json", "w", encoding="utf-8").write(raw)
    ptok = mtok = None
    for line in log.splitlines():
        if "tokens" not in line or "time" not in line:
            continue
        digits = re.findall(r"(\d+) tokens", line)
        if not digits:
            continue
        if "prompt" in line:
            ptok = int(digits[-1])
        else:
            mtok = int(digits[-1])
    return {"perfil": profile, "caso": case, "exit": proc.returncode,
            "elapsed_s": elapsed, "prompt_tokens": ptok, "gen_tokens": mtok,
            "raw": raw[:1600], "erro": log[-400:] if proc.returncode else None}

def main():
    segs = json.loads(read(os.path.join(DATA, "transcript-davyjones.json")))["segments"]
    v2 = json.loads(read(os.path.join(REPORTS, "candidates-v2.json")))["candidates"]
    def text_of(a, b):
        return " ".join(s["text"] for s in segs if s["start"] < b and s["end"] > a)
    def ctx(a, b, before):
        rel = [s for s in segs if (s["end"] <= a + 1e-9) if before] or [s for s in segs if (s["start"] >= b - 1e-9) if not before]
        return rel[0]["text"] if rel else None
    sys_control = "Você é um assistente que responde exclusivamente em JSON. /no_think"
    data_control = json.dumps({"pergunta": "Some 17 e 25.", "instrucao": "Responda o valor da soma."}, ensure_ascii=False)
    schema_control = {"type": "object", "additionalProperties": False, "required": ["soma"],
                      "properties": {"soma": {"type": "integer"}}}
    sys_eval = read(os.path.join(HERE, "src", "clips", "evaluate-prompt.txt"))
    picks3 = [c for c in v2 if abs(c["start"] - 110.8) < 1 or abs(c["start"] - 400.7) < 1 or abs(c["start"] - 483.3) < 1]
    items3 = [{"id": f"E{i+1}", "start": c["start"], "end": c["end"], "text": text_of(c["start"], c["end"]),
               "contextBefore": ctx(c["start"], c["end"], True), "contextAfter": ctx(c["start"], c["end"], False)}
              for i, c in enumerate(picks3[:3])]
    schema_eval = {"type": "object", "additionalProperties": False, "required": ["items"],
                   "properties": {"items": {"type": "array", "maxItems": 3, "items": {
                       "type": "object", "additionalProperties": False, "required": ["id", "score", "reason"],
                       "properties": {"id": {"type": "string"}, "score": {"type": "integer", "minimum": 0, "maximum": 100},
                                      "reason": {"type": "string"}}}}}}
    sys_rank = read(os.path.join(HERE, "src", "clips", "rerank-full-prompt.txt"))
    items12 = [{"id": f"C{i+1}", "start": c["start"], "end": c["end"], "text": text_of(c["start"], c["end"]),
                "contextBefore": ctx(c["start"], c["end"], True), "contextAfter": ctx(c["start"], c["end"], False)}
               for i, c in enumerate(v2)]
    schema_rank = {"type": "object", "additionalProperties": False, "required": ["picks"],
                   "properties": {"picks": {"type": "array", "maxItems": 3, "items": {
                       "type": "object", "additionalProperties": False, "required": ["id", "score", "reason"],
                       "properties": {"id": {"type": "string"}, "score": {"type": "integer", "minimum": 0, "maximum": 100},
                                      "reason": {"type": "string"}}}}}}
    cases = {
        "1": (sys_control, data_control, schema_control, 200),
        "2": (sys_eval, json.dumps({"candidates": items3}, ensure_ascii=False), schema_eval, 800),
        "3": (sys_rank, json.dumps({"limit": 3, "candidates": items12}, ensure_ascii=False), schema_rank, 800),
    }
    result = {
        "declarado_antes": "matriz 3 perfis x 3 casos; temp=0; 1 execucao por celula; falhas contam como resultado",
        "perfis": {
            "a": "vigente: /no_think + bloco think vazio preenchido; modelo instalado (metadados em reports/gguf-installed-metadata.json)",
            "b": "template oficial Instruct (sem /no_think, sem bloco think); mesmo modelo instalado",
            "c": "mesmo formato de B; Qwen3-4B-Instruct-2507-Q4_K_M em models/home-c (origem: mirror NAO-gated huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF — o repo oficial Qwen e gated e recusou download anonimo; mesmo modelo, licenca Apache-2.0; sha256 em models/*.sha256)",
        },
        "modelo_instalado_nome": gguf_name(os.path.join(VENDOR, "Qwen3-4B-Q4_K_M.gguf")),
        "modelo_2507_nome": gguf_name(os.path.join(HOME_C, "Qwen3-4B-Instruct-2507-Q4_K_M.gguf")),
        "celulas": [],
    }
    for profile in "abc":
        for case in "123":
            system, data, schema, tokens = cases[case]
            try:
                cell = run(profile, case, system, data, schema, tokens)
            except subprocess.TimeoutExpired:
                cell = {"perfil": profile, "caso": case, "exit": "timeout", "raw": "", "erro": "timeout 420s"}
            print(f"[{profile}-{case}] exit={cell.get('exit')} elapsed={cell.get('elapsed_s')}s ptok={cell.get('prompt_tokens')} gtok={cell.get('gen_tokens')}")
            result["celulas"].append(cell)
    io.open(os.path.join(REPORTS, "lab-matrix.json"), "w", encoding="utf-8").write(
        json.dumps(result, ensure_ascii=False, indent=1))
    print("gravado: reports/lab-matrix.json")

if __name__ == "__main__":
    main()
