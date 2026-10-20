#!/usr/bin/env python3
"""Camada de runtime do experimento de descoberta (janelas + avaliação).

Responsabilidades:
- argv EXATOS por perfil (registrados em cada chamada e relatório);
- execução de llama-completion/llama-tokenize (subprocess injetável p/ testes);
- leitura do log: n_ctx carregado, parâmetros de amostragem efetivos,
  tokens de prompt/geração (padrão "N tokens" / "N runs" do runtime);
- renderização do template de cada perfil (A/B/C ChatML; D Gemma 4 canônico
  extraído do GGUF, thinking desativado — bloco thought vazio no fim).

Nada aqui decide política editorial; apenas executa e reporta fatos.
"""
import json
import os
import re
import subprocess
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Runtimes disponíveis (binários idênticos; home-c/gpu inclui Vulkan).
RUNTIME_VENDOR = r"C:\CutNicePro\.tooling\vendor\analysis"
RUNTIME_C = os.path.join(HERE, "models", "home-c")

# Perfis — amostragem documentada por origem oficial (registrar diferenças):
#  a: paridade com o app (text_engine.rs): apenas --temp 0 --seed 42;
#     os demais defaults do runtime valem (top_k 40, top_p 0.95, min_p 0.05,
#     irrelevantes sob temp 0 → cadeia termina em greedy).
#  b: Qwen3 THINKING — modelo híbrido; recomendação oficial do model card
#     Qwen3 (modo thinking): temp 0.6, top_p 0.95, top_k 20.
#  c: Qwen3-4B-Instruct-2507 — model card 2507 Instruct: temp 0.7, top_p 0.8,
#     top_k 20, min_p 0 (sem modo thinking no checkpoint).
#  d: Gemma 4 12B IT QAT Q4_0 — metadados do GGUF (general.sampling.*) e
#     model card: temp 1.0, top_p 0.95, top_k 64; thinking NÃO ativado
#     (perfil instrucional; o token <|think|> existe e fica documentado).
PROFILES = {
    "a": {
        "runtime": RUNTIME_VENDOR,
        "model": "Qwen3-4B-Q4_K_M.gguf",
        "template": "chatml_prefill",
        "ctx": 8192,
        "sampling": {"temp": 0.0},  # paridade app: só temp 0 + seed
        "seed": 42,
        "grammar_discovery": True,
        "grammar_eval": True,
        "n_discovery": 2000,
        "n_eval": 2400,
        "thinking": "disabled-prefill",
        "desc": "Qwen3-4B-Q4_K_M instalado (vendor) — non-thinking, paridade com o app",
        "sampling_source": "produção (text_engine.rs): --temp 0 --seed 42",
    },
    "b": {
        "runtime": RUNTIME_VENDOR,
        "model": "Qwen3-4B-Q4_K_M.gguf",
        "template": "chatml_open",
        "ctx": 16384,
        "sampling": {"temp": 0.6, "top_k": 20, "top_p": 0.95, "min_p": 0.0},
        "seed": 42,
        "grammar_discovery": False,
        "grammar_eval": False,
        "n_discovery": 3000,
        "n_eval": 3000,
        "thinking": "natural",
        "desc": "mesmo checkpoint do instalado — thinking natural (sem prefill), SEM grammar",
        "sampling_source": "Qwen3 model card (thinking): temp 0.6, top_p 0.95, top_k 20",
    },
    "c": {
        "runtime": RUNTIME_C,
        "model": "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        "template": "chatml_open",
        "ctx": 8192,
        "sampling": {"temp": 0.7, "top_k": 20, "top_p": 0.8, "min_p": 0.0},
        "seed": 42,
        "grammar_discovery": True,
        "grammar_eval": True,
        "n_discovery": 2000,
        "n_eval": 2400,
        "thinking": "none",
        "desc": "Qwen3-4B-Instruct-2507 (home-c) — template próprio do GGUF (ChatML sem think)",
        "sampling_source": "Qwen3-2507-Instruct card: temp 0.7, top_p 0.8, top_k 20, min_p 0",
    },
    "d": {
        "runtime": RUNTIME_C,
        "model": os.path.join(HERE, "models", "home-e", "gemma-4-12b-it-qat-q4_0.gguf"),
        "template": "gemma4_notthink",
        "ctx": 8192,
        "sampling": {"temp": 1.0, "top_k": 64, "top_p": 0.95, "min_p": 0.0},
        "seed": 42,
        "grammar_discovery": True,
        "grammar_eval": True,
        "n_discovery": 2000,
        "n_eval": 2400,
        "thinking": "disabled-empty-block",
        "desc": "Gemma-4-12B-IT QAT Q4_0 (home-e) — template canônico do GGUF, thinking desativado",
        "sampling_source": "GGUF general.sampling.* (temp 1.0, top_p 0.95, top_k 64) + model card",
    },
}


def engine_exe(runtime, gpu=True):
    """Caminho do executável de inferência (prefere gpu/ com Vulkan)."""
    sub = "gpu" if gpu else "bin"
    exe = os.path.join(runtime, sub, "llama-completion.exe")
    if os.path.isfile(exe):
        return exe
    return os.path.join(runtime, "bin", "llama-completion.exe")


def tokenize_exe(runtime):
    return os.path.join(runtime, "bin", "llama-tokenize.exe")


def build_argv(profile, prompt_path, schema_path, n_predict, use_grammar):
    """argv exato enviado ao executável. Retorna (exe, argv)."""
    cfg = PROFILES[profile]
    exe = engine_exe(cfg["runtime"])
    argv = [
        exe, "-m", cfg["model"] if os.path.isabs(cfg["model"]) else os.path.join(cfg["runtime"], cfg["model"]),
        "-f", prompt_path,
        "-t", "8", "-c", str(cfg["ctx"]), "-n", str(n_predict),
        "--seed", str(cfg["seed"]),
        "--no-conversation", "--no-display-prompt", "--no-escape",
        "--simple-io", "--verbosity", "3",
    ]
    # Paridade do perfil a: o app passa apenas --temp 0 (defaults do runtime
    # permanecem); b/c/d sobrescrevem explicitamente a amostragem documentada.
    if profile == "a":
        argv += ["--temp", "0"]
    else:
        argv += ["--temp", str(cfg["sampling"]["temp"])]
        argv += ["--top-k", str(cfg["sampling"]["top_k"])]
        argv += ["--top-p", str(cfg["sampling"]["top_p"])]
        argv += ["--min-p", str(cfg["sampling"]["min_p"])]
    if use_grammar and schema_path:
        argv += ["-jf", schema_path]
    return exe, argv


def default_engine(argv, timeout=900):
    """Executa argv de inferência e devolve o registro factual da chamada."""
    t0 = time.time()
    try:
        proc = subprocess.run(argv, capture_output=True, text=True,
                              timeout=timeout, encoding="utf-8", errors="replace")
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "elapsed_s": round(time.time() - t0, 1),
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False, "returncode": None, "stdout": "", "stderr": "TIMEOUT",
            "elapsed_s": round(time.time() - t0, 1),
        }


def default_tokenizer(runtime, model_path, text, cache_path=None):
    """Conta tokens do texto com o tokenizador REAL do modelo
    (llama-tokenize --show-count; adiciona BOS como o runtime faz).
    Cache em disco evita recarregar o modelo a cada medição."""
    if cache_path and os.path.isfile(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as f:
                cache = json.load(f)
        except (OSError, ValueError):
            cache = {}
    else:
        cache = {}
    key = model_path + "::" + str(len(text)) + "::" + text[:64] + text[-64:]
    if key in cache:
        return cache[key], True
    tmp = cache_path + ".in" if cache_path else os.path.join(HERE, "scratch", "_tok.in")
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    proc = subprocess.run(
        [tokenize_exe(runtime), "-m", model_path, "-f", tmp, "--show-count"],
        capture_output=True, text=True, timeout=300, encoding="utf-8", errors="replace")
    count = None
    for line in proc.stdout.splitlines():
        m = re.search(r"(\d+)", line)
        if "total number of tokens" in line.lower() or line.strip().isdigit():
            if line.strip().isdigit():
                count = int(line.strip())
            elif m:
                count = int(m.group(1))
    if count is None:
        raise RuntimeError("llama-tokenize não devolveu contagem: " + proc.stdout[-300:])
    cache[key] = count
    if cache_path:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f)
    return count, False


def parse_log(stderr):
    """Extrai do log os FATOS efetivos: n_ctx carregado, sampler, tokens."""
    facts = {"n_ctx": None, "sampler": {}, "prompt_tokens": None,
             "gen_tokens": None, "error": None}
    for line in stderr.splitlines():
        if "n_ctx = " in line and facts["n_ctx"] is None:
            m = re.search(r"n_ctx = (\d+)", line)
            if m:
                facts["n_ctx"] = int(m.group(1))
        if "sampler params" in line:
            facts["_sampler_block"] = True
        if "prompt is too long" in line:
            m = re.search(r"\((\d+) tokens, max (\d+)\)", line)
            facts["error"] = "prompt_too_long"
            if m:
                facts["prompt_tokens"] = int(m.group(1))
                facts["max_tokens"] = int(m.group(2))
        if "prompt eval time" in line:
            m = re.search(r"/ +(\d+) tokens", line)
            if m:
                facts["prompt_tokens"] = int(m.group(1))
        if "eval time" in line and " runs" in line:
            m = re.search(r"/ +(\d+) runs", line)
            if m:
                facts["gen_tokens"] = int(m.group(1))
    block = stderr.split("sampler params:", 1)
    if len(block) == 2:
        for line in block[1].splitlines():
            for m in re.finditer(r"([a-z_0-9]+)\s*=\s*([-\d.]+)", line):
                facts["sampler"][m.group(1)] = float(m.group(2))
    return facts


def render_prompt(profile, system, user_data):
    """Monta o prompt final no formato OFICIAL do perfil."""
    tpl = PROFILES[profile]["template"]
    if tpl == "chatml_prefill":  # paridade text_engine.rs:74 (app)
        return ("<|im_start|>system\n" + system + "<|im_end|>\n"
                "<|im_start|>user\n" + user_data + "<|im_end|>\n"
                "<|im_start|>assistant\n<think>\n\n</think>\n\n")
    if tpl == "chatml_open":  # b (thinking natural) e c (2507 sem think)
        return ("<|im_start|>system\n" + system + "<|im_end|>\n"
                "<|im_start|>user\n" + user_data + "<|im_end|>\n"
                "<|im_start|>assistant\n")
    if tpl == "gemma4_notthink":
        # Template canônico do GGUF (sem tools, thinking desativado):
        # <|turn>system\n{sys}<turn|\n<|turn>user\n{msg}<turn|\n
        # <|turn>model\n<|channel>thought\n<channel|>
        # BOS é adicionado pelo runtime (verificado na prova curta).
        return ("<|turn>system\n" + system.strip() + "<turn|\n"
                "<|turn>user\n" + user_data.strip() + "<turn|\n"
                "<|turn>model\n<|channel>thought\n<channel|>")
    raise ValueError("template desconhecido: " + tpl)


def extract_json(text, thinking):
    """Extrai o objeto JSON da resposta bruta, separando raciocínio da
    resposta final. Levanta ValueError quando não há JSON válido."""
    raw = text
    if thinking == "natural":
        # Qwen híbrido: o que importa é DEPOIS do último </think>.
        raw = raw.split("</think>")[-1]
    if thinking == "disabled-empty-block":
        # Gemma 4 pode emitir bloco thought residual antes da resposta.
        raw = re.sub(r"<\|channel>thought\n.*?<channel\|>", "", raw, flags=re.S)
    start = raw.find("{")
    while start != -1:
        try:
            obj, _ = json.JSONDecoder().raw_decode(raw[start:])
            return obj
        except ValueError:
            start = raw.find("{", start + 1)
    raise ValueError("sem JSON válido na resposta")
