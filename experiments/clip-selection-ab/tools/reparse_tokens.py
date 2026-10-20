import io, json, re
d = json.load(io.open('reports/lab-matrix.json', encoding='utf-8'))
for c in d['celulas']:
    log = io.open(f"scratch/lab-{c['perfil']}-{c['caso']}.log", encoding='utf-8', errors='replace').read()
    m = re.search(r"prompt eval time = +[0-9.]+ ms / +([0-9]+) tokens", log)
    c['prompt_tokens'] = int(m.group(1)) if m else None
    m = re.search(r"eval time = +[0-9.]+ ms / +([0-9]+) runs", log)
    c['gen_tokens'] = int(m.group(1)) if m else None
json.dump(d, io.open('reports/lab-matrix.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for c in d['celulas']:
    print(f"[{c['perfil']}-{c['caso']}] ptok={c['prompt_tokens']} gtok={c['gen_tokens']} {c['elapsed_s']}s")
