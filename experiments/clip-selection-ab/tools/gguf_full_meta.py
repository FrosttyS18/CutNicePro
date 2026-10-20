#!/usr/bin/env python3
"""Leitor COMPLETO de metadados GGUF (pula tensores; lê todos os KVs)."""
import json, os, struct, sys, io

SZ = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8}
FM = {0: '<B', 1: '<b', 2: '<H', 3: '<h', 4: '<I', 5: '<i', 6: '<f', 7: '<B', 10: '<Q', 11: '<q', 12: '<d'}


def read_full(path):
    f = open(path, 'rb')
    assert f.read(4) == b'GGUF', 'não é GGUF'
    version = struct.unpack('<I', f.read(4))[0]
    n_tensors = struct.unpack('<Q', f.read(8))[0]
    n_kv = struct.unpack('<Q', f.read(8))[0]

    def rstr():
        n = struct.unpack('<Q', f.read(8))[0]
        return f.read(n).decode('utf-8', 'replace')

    def rval(t):
        if t in SZ:
            return struct.unpack(FM[t], f.read(SZ[t]))[0]
        if t == 8:
            return rstr()
        if t == 9:
            # layout observado nestes arquivos: type (u32) ANTES do count (u32)
            et = struct.unpack('<I', f.read(4))[0]
            n = struct.unpack('<I', f.read(4))[0]
            size = os.fstat(f.fileno()).st_size
            if et in SZ:
                f.seek(SZ[et] * n, 1)
                return f'<array {n}x type {et}>'
            if et == 8:
                for _ in range(n):
                    ln = struct.unpack('<Q', f.read(8))[0]
                    if ln > 10_000_000 or f.tell() + ln > size:
                        raise ValueError(f'string de array suspeita (len={ln})')
                    f.seek(ln, 1)
                return f'<array {n} strings>'
            raise ValueError(f'array de tipo {et}')
        raise ValueError(f'tipo {t}')

    out = {}
    for _ in range(n_kv):
        key = rstr()
        t = struct.unpack('<I', f.read(4))[0]
        out[key] = rval(t)
    return version, n_tensors, out


def main():
    path = sys.argv[1]
    dest = sys.argv[2]
    version, n_tensors, kv = read_full(path)
    keep = {}
    for key in sorted(kv):
        value = kv[key]
        if isinstance(value, str) and len(value) > 400:
            keep[key + f' (len={len(value)})'] = value[:400] + '…'
        else:
            keep[key] = value
    result = {
        'arquivo': path,
        'gguf_version': version,
        'n_tensors': n_tensors,
        'n_kv': len(kv),
        'parse': 'COMPLETO (todos os KVs lidos; arrays pulados com tamanho declarado)',
        'metadados': keep,
    }
    io.open(dest, 'w', encoding='utf-8').write(json.dumps(result, ensure_ascii=False, indent=1))
    for key in ('general.name', 'general.architecture', 'general.type', 'general.organization',
                'general.finetune', 'general.basename', 'general.size_label', 'general.license',
                'general.source.url', 'general.source.huggingface.repository',
                'general.conversion', 'general.repo_url', 'tokenizer.chat_template (len=0)' if 'tokenizer.chat_template' in kv and kv['tokenizer.chat_template'] == '' else 'tokenizer.chat_template'):
        if key in kv:
            v = kv[key]
            if isinstance(v, str) and len(v) > 120:
                v = v[:120] + '…'
            print(f'{key}: {v!r}')


if __name__ == '__main__':
    main()
