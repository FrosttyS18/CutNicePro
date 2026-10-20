#!/usr/bin/env python3
"""Leitor minimalista de metadados GGUF conforme a especificação
(v3: array = value_type u32 + count u64 + elementos). Extrai KVs escalares,
strings (incluindo tokenizer.chat_template) e ignora o conteúdo de arrays
grandes (consome-os corretamente para prosseguir o parse).
Uso: python tools/gguf_meta2.py <modelo.gguf> <saida.json>
"""
import json, struct, sys, io

SZ = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8}
FM = {0: '<B', 1: '<b', 2: '<H', 3: '<h', 4: '<I', 5: '<i', 6: '<f', 7: '<B', 10: '<Q', 11: '<q', 12: '<d'}
MAX_ARRAY_DUMP = 64
MAX_STRING_KEEP = 200000


def read_meta(path):
    out = {}
    with open(path, 'rb') as f:
        assert f.read(4) == b'GGUF', 'não é GGUF'
        version = struct.unpack('<I', f.read(4))[0]
        n_tensors = struct.unpack('<Q', f.read(8))[0]
        n_kv = struct.unpack('<Q', f.read(8))[0]
        out['_gguf'] = {'version': version, 'n_tensors': n_tensors, 'n_kv': n_kv}

        def rstr():
            n = struct.unpack('<Q', f.read(8))[0]
            return f.read(n).decode('utf-8', 'replace')

        for _ in range(n_kv):
            key = rstr()
            t = struct.unpack('<I', f.read(4))[0]
            if t in SZ:
                out[key] = struct.unpack(FM[t], f.read(SZ[t]))[0]
            elif t == 8:
                s = rstr()
                out[key] = s if len(s) <= MAX_STRING_KEEP else s[:MAX_STRING_KEEP] + '…[truncado]'
            elif t == 9:
                et = struct.unpack('<I', f.read(4))[0]
                n = struct.unpack('<Q', f.read(8))[0]
                if et == 8:
                    # array de strings: guarda as primeiras MAX_ARRAY_DUMP
                    keep = []
                    for i in range(n):
                        s = rstr()
                        if i < MAX_ARRAY_DUMP:
                            keep.append(s if len(s) <= 4096 else s[:4096] + '…')
                    out[key] = {'_array_type': 'string', 'count': n, 'first': keep}
                else:
                    if et in SZ:
                        f.seek(SZ[et] * n, 1)
                    else:
                        raise ValueError(f'tipo de elemento de array não escalar: {et}')
                    out[key] = {'_array_type': et, 'count': n}
            else:
                raise ValueError(f'tipo de KV desconhecido: {t}')
    return out


if __name__ == '__main__':
    meta = read_meta(sys.argv[1])
    io.open(sys.argv[2], 'w', encoding='utf-8').write(
        json.dumps(meta, ensure_ascii=False, indent=1))
    scalars = {k: v for k, v in meta.items()
               if not isinstance(v, (dict, list)) and not k.startswith('_')}
    print(json.dumps(scalars, ensure_ascii=False, indent=1))
    print('chat_template presente:', 'tokenizer.chat_template' in meta)
