import io, json, os, struct

def extract_template(path):
    data = open(path, 'rb').read()
    key = b'tokenizer.chat_template'
    i = data.find(key)
    while i != -1:
        if i >= 8:
            klen = struct.unpack('<Q', data[i-8:i])[0]
            if klen == len(key):
                p = i + len(key)
                t = struct.unpack('<I', data[p:p+4])[0]
                if t == 8:
                    vlen = struct.unpack('<Q', data[p+4:p+12])[0]
                    if 0 < vlen < 200000:
                        return data[p+12:p+12+vlen].decode('utf-8', 'replace')
        i = data.find(key, i+1)
    return None

for path, dest in [
    (r'C:\CutNicePro\.tooling\vendor\analysis\Qwen3-4B-Q4_K_M.gguf', 'reports/gguf-installed-template.txt'),
    (r'models/home-c/Qwen3-4B-Instruct-2507-Q4_K_M.gguf', 'reports/gguf-2507-template.txt'),
]:
    tpl = extract_template(path)
    io.open(dest, 'w', encoding='utf-8').write(tpl or '')
    print('==', os.path.basename(path), '| template len:', len(tpl) if tpl else None)
    if tpl:
        print(tpl[:600].replace('\n', '\\n'))
    j = dest.replace('-template.txt', '-full.json')
    d = json.load(io.open(j, encoding='utf-8'))
    d['tokenizer_chat_template_extraido'] = (tpl[:800] + '…') if tpl and len(tpl) > 800 else tpl
    d['errata'] = ('a rodada 4 declarou template VAZIO por DEFAULT de parser interrompido — FALSO; '
                   'o template existe e foi extraído por parse localizado (bytefind + validacao de header)')
    io.open(j, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1))
    print('atualizado:', j)
