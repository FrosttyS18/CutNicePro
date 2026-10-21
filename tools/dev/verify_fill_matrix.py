#!/usr/bin/env python3
"""Validação VISUAL do preenchimento (atualização 13).

Extrai frames inicial/intermediário/final de cada MP4 da matriz, confere
por PIXEL o comportamento esperado (barras×conteúdo, ponto focal) e gera
montagem de evidência em docs/reports/evidence/fill-matrix/.
"""
import json
import os
import subprocess
import sys

FF = r"C:\CutNicePro\.tooling\vendor\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe"
FFPROBE = r"C:\CutNicePro\.tooling\vendor\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffprobe.exe"
SRC = r"C:\CutNicePro\.tooling\test-output\fill-matrix"
OUT = r"C:\CutNicePro\docs\reports\evidence\fill-matrix"
os.makedirs(OUT, exist_ok=True)

results = []


def dims(video):
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", video],
        capture_output=True, text=True).stdout
    info = json.loads(out)["streams"][0]
    return int(info["width"]), int(info["height"])


def frame(video, t, name):
    png = os.path.join(OUT, name)
    subprocess.run([FF, "-y", "-v", "error", "-ss", str(t), "-i", video,
                    "-frames:v", "1", png], check=True, capture_output=True)
    return png


def pixel(png, x, y):
    """Lê RGBA de um pixel via ffmpeg + rawvideo (sem dependências)."""
    out = subprocess.run(
        [FF, "-v", "error", "-i", png, "-vf", f"crop=1:1:{x}:{y}",
         "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
        capture_output=True, check=True).stdout
    return out[:3]


def is_black(px, tol=24):
    return all(channel <= tol for channel in px)


def check(name, ok, detail=""):
    results.append({"caso": name, "ok": bool(ok), "detalhe": str(detail)})
    print(("OK  " if ok else "FALHA") + f" {name} {detail}")


def analyse(case):
    video = os.path.join(SRC, f"{case}.mp4")
    w, h = dims(video)
    first = frame(video, 0.1, f"{case}-inicio.png")
    mid = frame(video, 1.0, f"{case}-meio.png")
    last = frame(video, 1.9, f"{case}-fim.png")
    return w, h, (first, mid, last)


# 1:1 Ajustar (contain, 1080x1080, fonte 16:9 → barras acima/abaixo)
w, h, frames = analyse("1x1-ajustar")
top = pixel(frames[1], w // 2, 8)
bottom = pixel(frames[1], w // 2, h - 8)
center = pixel(frames[1], w // 2, h // 2)
check("1x1 Ajustar dimensões", (w, h) == (1080, 1080), f"{w}x{h}")
check("1x1 Ajustar barras topo/base pretas", is_black(top) and is_black(bottom),
      f"top={top} bottom={bottom}")
check("1x1 Ajustar centro com conteúdo", not is_black(center), f"center={center}")

# 1:1 Preencher (cover, 1080x1080 → sem barras: cantos com conteúdo)
w, h, frames = analyse("1x1-preencher")
corners = [pixel(frames[1], x, y) for x, y in
           [(8, 8), (w - 8, 8), (8, h - 8), (w - 8, h - 8)]]
check("1x1 Preencher cantos com conteúdo", all(not is_black(c) for c in corners),
      f"corners={corners}")
check("1x1 Preencher frames coerentes",
      not is_black(pixel(frames[0], w // 2, h // 2))
      and not is_black(pixel(frames[2], w // 2, h // 2)))

# 9:16 Ajustar (contain, fonte 16:9 em 1080x1920 → conteúdo 1080x607
# centralizado; barras ACIMA/ABAIXO, laterais com conteúdo)
w, h, frames = analyse("9x16-ajustar")
top = pixel(frames[1], w // 2, 8)
bottom = pixel(frames[1], w // 2, h - 8)
left = pixel(frames[1], 8, h // 2)
center = pixel(frames[1], w // 2, h // 2)
check("9:16 Ajustar barras topo/base pretas", is_black(top) and is_black(bottom),
      f"top={top} bottom={bottom}")
check("9:16 Ajustar centro com conteúdo", not is_black(center))
# largura ocupada: varre a linha central do conteúdo (y=h//2) contando
# pixels não pretos — o padrão testsrc tem colunas pretas próprias, então
# exigimos maioria não-preta, não 100%
row = os.path.join(OUT, "row916.raw")
subprocess.run([FF, "-y", "-v", "error", "-i", frames[1],
                "-vf", f"crop={w}:1:0:{h // 2}", "-f", "rawvideo",
                "-pix_fmt", "gray", row], check=True, capture_output=True)
raw = open(row, "rb").read()
non_black = sum(1 for b in raw if b > 24)
right_edge = pixel(frames[1], w - 8, h // 2)
# testsrc tem zonas escuras próprias na esquerda do padrão: usamos maioria
# ≥70% + borda DIREITA não-preta (a fonte 16:9 em conter 9:16 ocupa toda a
# largura 1080; barras ficam só acima/abaixo)
check("9:16 Ajustar largura ocupada (≥70% da linha + borda direita)",
      non_black >= int(w * 0.7) and not is_black(right_edge),
      f"{non_black}/{w} não pretos; right={right_edge}")

# 9:16 Preencher (cover, 1080x1920 → sem barras laterais)
w, h, frames = analyse("9x16-preencher")
edges = [pixel(frames[1], 8, h // 2), pixel(frames[1], w - 8, h // 2)]
check("9:16 Preencher bordas com conteúdo", all(not is_black(c) for c in edges),
      f"edges={edges}")

# Ponto focal à esquerda (cover 1:1, x=0 mantém a ESQUERDA da fonte;
# padrão testsrc tem cores distintas nas laterais)
w, h, frames = analyse("1x1-preencher-focal-esq")
w2, h2, frames_center = analyse("1x1-preencher")
left_f = pixel(frames[1], 8, h // 2)
right_f = pixel(frames[1], w - 8, h // 2)
left_c = pixel(frames_center[1], 8, h // 2)
right_c = pixel(frames_center[1], w - 8, h // 2)
changed = left_f != left_c or right_f != right_c
check("Ponto focal x=0 muda o enquadramento", changed,
      f"focal=({left_f},{right_f}) centro=({left_c},{right_c})")

# Proporção original (16:9 → 1920x1080, sem barras esperadas)
w, h, frames = analyse("proporcao-original")
check("Proporção original dimensões", (w, h) == (1920, 1080), f"{w}x{h}")
check("Proporção original centro com conteúdo",
      not is_black(pixel(frames[1], w // 2, h // 2)))

# montagem 3x2 (frame do meio de cada caso)
subprocess.run(
    [FF, "-y", "-v", "error",
     "-i", os.path.join(OUT, "1x1-ajustar-meio.png"),
     "-i", os.path.join(OUT, "1x1-preencher-meio.png"),
     "-i", os.path.join(OUT, "9x16-ajustar-meio.png"),
     "-i", os.path.join(OUT, "9x16-preencher-meio.png"),
     "-i", os.path.join(OUT, "1x1-preencher-focal-esq-meio.png"),
     "-i", os.path.join(OUT, "proporcao-original-meio.png"),
     "-filter_complex",
     "[0][1][2][3][4][5]xstack=inputs=6:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h1|w0_h0+h1,scale=1600:-2",
     os.path.join(OUT, "montagem.png")], check=True, capture_output=True)

with open(os.path.join(OUT, "results.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=1)
failed = [r for r in results if not r["ok"]]
print(f"RESULTADO: {len(results) - len(failed)}/{len(results)} OK")
sys.exit(1 if failed else 0)
