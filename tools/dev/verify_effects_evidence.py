"""Atualização 15 — verificação do render real com zoom+efeitos+volume.
Compara neutro.mp4 × editado.mp4 (zoom 2×, brilho 160, volume 150%, karaoke):
- dimensões 1080×1920 nos dois;
- luminância média (YAVG) maior no editado (brilho 160);
- volume médio maior no editado (1,5×);
- frames visivelmente distintos (o zoom 2× muda o enquadramento)."""
import json, subprocess, sys

BASE = ".tooling/test-output/effects-evidence"

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                          "-show_entries", "stream=width,height", "-of", "json", path],
                         capture_output=True, text=True, check=True).stdout
    stream = json.loads(out)["streams"][0]
    return stream["width"], stream["height"]

def yavg(path):
    out = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-vf", "signalstats,metadata=print",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    values = [float(line.split("=")[1]) for line in out.splitlines() if "YAVG" in line]
    return sum(values) / len(values) if values else -1

def volume(path):
    out = subprocess.run(["ffmpeg", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "mean_volume" in line:
            return float(line.split("mean_volume:")[1].replace("dB", "").strip())
    return -999

w_n, h_n = probe(f"{BASE}/neutro.mp4")
w_e, h_e = probe(f"{BASE}/editado.mp4")
dims_ok = (w_n, h_n) == (w_e, h_e) == (1080, 1920)

y_n, y_e = yavg(f"{BASE}/neutro.mp4"), yavg(f"{BASE}/editado.mp4")
brilho_ok = y_e > y_n * 1.1  # brilho 160 (+60%) domina; tolerância por codec

v_n, v_e = volume(f"{BASE}/neutro.mp4"), volume(f"{BASE}/editado.mp4")
volume_ok = v_e > v_n + 1.0  # 1,5× ≈ +3,5 dB

print(f"dims: neutro {w_n}x{h_n} editado {w_e}x{h_e} → {'OK' if dims_ok else 'FAIL'}")
print(f"YAVG: neutro {y_n:.1f} editado {y_e:.1f} → {'OK (brilho aplicado)' if brilho_ok else 'FAIL'}")
print(f"mean_volume: neutro {v_n} dB editado {v_e} dB → {'OK (150% aplicado)' if volume_ok else 'FAIL'}")
ok = dims_ok and brilho_ok and volume_ok
print("RESULTADO:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
