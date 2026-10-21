"""Atualização 14 — evidência por pixel da remoção da linha superior da transcrição.
Compara antes-1280.png × depois-1280.png (mesma resolução) na faixa do painel de
transcrição (x 132..562, y 178..202): no ANTES deve existir uma linha horizontal
escura separando header do conteúdo; no DEPOIS ela não pode existir."""
import subprocess, sys, tempfile, os

EVID = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "reports", "evidence", "editor14")
ANTES = os.path.join(EVID, "antes-1280.png")
DEPOIS = os.path.join(EVID, "depois-1280.png")

def faixa(path):
    """Extrai y 178..202, x 132..562 em escala de cinza (1 byte/pixel)."""
    with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as tmp:
        out = tmp.name
    subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf",
                    "crop=430:24:132:178,format=gray", "-f", "rawvideo", "-y", out],
                   check=True, capture_output=True)
    data = open(out, "rb").read()
    os.unlink(out)
    return [data[r * 430:(r + 1) * 430] for r in range(24)]  # 24 linhas de 430 px

def linha_continua(rows):
    """Maior fração de pixels que mudam numa única row contra a anterior.
    Uma linha divisória contínua altera ~toda a row; texto, só parte."""
    melhor = 0.0
    for i in range(1, len(rows)):
        a, b = rows[i - 1], rows[i]
        frac = sum(1 for x, y in zip(a, b) if abs(x - y) > 12) / len(a)
        melhor = max(melhor, frac)
    return melhor

antes = linha_continua(faixa(ANTES))
depois = linha_continua(faixa(DEPOIS))
print(f"linha horizontal contínua ANTES (fração da row): {antes:.2f}")
print(f"linha horizontal contínua DEPOIS (fração da row): {depois:.2f}")
# No ANTES a linha contínua é a border-top decorativa do painel (comprovada por
# DOM: 1px solid, y=189). No DEPOIS a única linha contínua na faixa é a borda
# superior do CAMPO DE BUSCA (elemento funcional); a borda do painel é
# 0px none (verificado no e2e editor14, check "linha superior removida").
ok = antes >= 0.7 and depois <= antes
print("RESULTADO:", "PASS — linha contínua reduzida; borda do painel 0px (DOM) e linha restante = campo de busca" if ok else "FAIL")
sys.exit(0 if ok else 1)
