import math
import re
import statistics
import subprocess
import time
from pathlib import Path


def validate_request(request):
    start, end = request.get("start"), request.get("end")
    if (request.get("mode") != "split"
            or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                   for v in (start, end))
            or start < 0 or end - start < 0.05):
        raise ValueError("Pedido de tela dividida inválido")
    viewport = request.get("viewport")
    if viewport is None:
        return
    if not isinstance(viewport, dict):
        raise ValueError("Área visível da prévia inválida")
    values = [viewport.get(key) for key in ("x", "y", "width", "height")]
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise ValueError("Área visível da prévia inválida")
    x, y, width, height = values
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1 + 1e-9 or y + height > 1 + 1e-9:
        raise ValueError("Área visível da prévia inválida")


def crop_position(center, fraction):
    if fraction >= 1:
        return 0.5
    return max(0.0, min(1.0, (center - fraction / 2) / (1 - fraction)))


def split_faces(faces, width, height, viewport=None):
    area = viewport or {"x": 0, "y": 0, "width": 1, "height": 1}
    usable = []
    for face in faces:
        if len(face) < 15 or not all(math.isfinite(float(face[i])) for i in (0, 1, 2, 3, 14)):
            return None
        x, y, w, h, confidence = [float(face[i]) for i in (0, 1, 2, 3, 14)]
        if confidence < 0.8 or w < width * 0.035 or h < height * 0.035:
            continue
        if x < 0 or y < 0 or x + w > width or y + h > height:
            return None
        cx, cy = (x + w / 2) / width, (y + h / 2) / height
        if not (area["x"] <= cx <= area["x"] + area["width"]
                and area["y"] <= cy <= area["y"] + area["height"]):
            continue
        usable.append({"cx": cx, "cy": cy, "width": w / width, "height": h / height})
    if len(usable) != 2:
        return None
    a, b = usable
    if (abs(a["cx"] - b["cx"]) < (a["width"] + b["width"]) * 0.6
            and abs(a["cy"] - b["cy"]) < (a["height"] + b["height"]) * 0.6):
        return None
    axis = "cx" if abs(a["cx"] - b["cx"]) >= abs(a["cy"] - b["cy"]) else "cy"
    return sorted(usable, key=lambda face: face[axis])


def split_panel(faces, source_width, source_height):
    median = {key: statistics.median(face[key] for face in faces)
              for key in ("cx", "cy", "width", "height")}
    for key in ("cx", "cy"):
        if max(face[key] for face in faces) - min(face[key] for face in faces) > 0.12:
            return None
    for key in ("width", "height"):
        if max(face[key] for face in faces) > min(face[key] for face in faces) * 1.8:
            return None
    scale = max(1080 / source_width, 960 / source_height)
    base_x, base_y = 1080 / (source_width * scale), 960 / (source_height * scale)
    zoom = max(1.0, min(3.0, base_x / (median["width"] * 3.2), base_y / (median["height"] * 3.2)))
    fraction_x, fraction_y = base_x / zoom, base_y / zoom
    x, y = crop_position(median["cx"], fraction_x), crop_position(median["cy"], fraction_y)
    left, top = (1 - fraction_x) * x, (1 - fraction_y) * y
    for face in faces:
        if (face["cx"] - face["width"] * 0.65 < left
                or face["cx"] + face["width"] * 0.65 > left + fraction_x
                or face["cy"] - face["height"] * 0.65 < top
                or face["cy"] + face["height"] * 0.65 > top + fraction_y):
            return None
    return {"x": x * 100, "y": y * 100, "zoom": zoom}


def manual(message="Não foi possível confirmar duas pessoas simultâneas na área visível. Use quadro único ou escolha outro trecho."):
    return {"status": "manual", "message": message}


def summarize_split(samples, source_width, source_height):
    if len(samples) < 3 or any(sample is None for sample in samples):
        return manual()
    panels = [split_panel([sample[index] for sample in samples], source_width, source_height) for index in (0, 1)]
    if any(panel is None for panel in panels):
        return manual("As regiões mudam entre as amostras e não sustentam dois enquadramentos nesta cena. Use quadro único.")
    scale = max(1080 / source_width, 960 / source_height)
    for index, panel in enumerate(panels):
        crop_w = 1080 / (source_width * scale * panel["zoom"])
        crop_h = 960 / (source_height * scale * panel["zoom"])
        left, top = (1 - crop_w) * panel["x"] / 100, (1 - crop_h) * panel["y"] / 100
        for sample in samples:
            other = sample[1 - index]
            if (other["cx"] + other["width"] / 2 > left
                    and other["cx"] - other["width"] / 2 < left + crop_w
                    and other["cy"] + other["height"] / 2 > top
                    and other["cy"] - other["height"] / 2 < top + crop_h):
                return manual("As pessoas estão próximas demais para separar os painéis com segurança. Use quadro único.")
    return {"status": "found", "layout": {"version": 1, "top": panels[0], "bottom": panels[1]},
            "message": "Duas regiões faciais estáveis encontradas nesta cena. Revise os painéis antes de salvar."}


def remaining(deadline):
    seconds = deadline - time.monotonic()
    if seconds <= 0:
        raise TimeoutError("A sugestão por cena excedeu o limite local de 60 segundos. Use um trecho menor ou quadro único.")
    return seconds


def scene_intervals(request, deadline):
    source, ffmpeg = Path(request["source"]), Path(request["ffmpeg"])
    start, end = request["start"], request["end"]
    video_filter = (f"trim=start={start:.9f}:end={end:.9f},scale=320:-2,"
                    "select=gte(scene\\,0.10),metadata=print:file=-")
    command = [str(ffmpeg), "-hide_banner", "-loglevel", "error", "-copyts", "-ss", f"{start:.9f}",
               "-t", f"{end - start:.9f}", "-threads", "1", "-i", str(source), "-an", "-sn",
               "-vf", video_filter, "-filter_threads", "1", "-fps_mode", "vfr", "-threads", "1",
               "-f", "null", "-"]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=remaining(deadline),
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired as error:
        raise TimeoutError("A detecção de cenas excedeu o limite local de 60 segundos. Use um trecho menor.") from error
    remaining(deadline)
    if result.returncode != 0:
        raise ValueError("Não foi possível detectar as mudanças de câmera no vídeo local. Use quadro único.")
    if len(result.stdout) > 1024 * 1024:
        raise ValueError("A detecção de cenas excedeu o limite de dados. Use um trecho menor.")
    cuts = set()
    for token in re.findall(r"pts_time:([^\s]+)", result.stdout):
        try:
            at = float(token)
        except ValueError as error:
            raise ValueError("A detecção retornou um instante de cena inválido.") from error
        if not math.isfinite(at):
            raise ValueError("A detecção retornou um instante de cena inválido.")
        if start < at < end:
            cuts.add(at)
    if len(cuts) + 1 > 64:
        raise ValueError("O trecho excede o limite de 64 cenas. Escolha um intervalo menor ou use quadro único.")
    boundaries = [start, *sorted(cuts), end]
    return list(zip(boundaries, boundaries[1:]))


def analyze_split(request):
    import cv2
    validate_request(request)
    started = time.monotonic()
    deadline = started + 60
    source, model = Path(request["source"]), Path(request["model"])
    ffmpeg = request.get("ffmpeg")
    if not source.is_file() or not model.is_file() or not isinstance(ffmpeg, str) or not Path(ffmpeg).is_file():
        raise ValueError("Vídeo, modelo ou FFmpeg local indisponível")
    cv2.setNumThreads(1)
    cv2.ocl.setUseOpenCL(False)
    samples_count = 0
    shots = []
    try:
        intervals = scene_intervals(request, deadline)
        capture = cv2.VideoCapture(str(source), cv2.CAP_FFMPEG, [
            cv2.CAP_PROP_N_THREADS, 1, cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000,
            cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000])
        try:
            if not capture.isOpened():
                raise ValueError("Não foi possível ler o vídeo para tela dividida")
            detector = cv2.FaceDetectorYN.create(str(model), "", (960, 540), 0.8, 0.3, 50)
            for start, end in intervals:
                margin = min(0.08, (end - start) / 4)
                samples = []
                source_width, source_height = 0, 0
                for at in (start + margin, (start + end) / 2, end - margin):
                    remaining(deadline)
                    samples_count += 1
                    if not capture.set(cv2.CAP_PROP_POS_MSEC, at * 1000):
                        samples.append(None)
                        continue
                    ok, frame = capture.read()
                    remaining(deadline)
                    if not ok:
                        samples.append(None)
                        continue
                    source_height, source_width = frame.shape[:2]
                    if source_width <= 0 or source_height <= 0:
                        samples.append(None)
                        continue
                    height = max(2, round(source_height * 960 / source_width))
                    frame = cv2.resize(frame, (960, height))
                    detector.setInputSize((960, height))
                    _, faces = detector.detect(frame)
                    remaining(deadline)
                    samples.append(split_faces(faces if faces is not None else [], 960, height, request.get("viewport")))
                if end - start < 0.05:
                    continue
                suggestion = summarize_split(samples, source_width, source_height)
                if suggestion["status"] == "found":
                    layout = suggestion["layout"]
                    shots.append({"sourceStart": start, "sourceEnd": end, "top": layout["top"], "bottom": layout["bottom"]})
        finally:
            capture.release()
        suggestion = manual()
        if shots:
            suggestion = {"status": "found", "layout": {"version": 1, "top": shots[0]["top"],
                          "bottom": shots[0]["bottom"], "shots": shots},
                          "message": "Painéis sugeridos por cena. Cenas sem duas pessoas confirmadas usam quadro único. Revise antes de salvar."}
    except (ValueError, TimeoutError) as error:
        suggestion = manual(str(error))
    return {"version": 2, "backend": "yunet-split-scenes-v2", "samples": samples_count,
            "suggestion": suggestion, "elapsedMs": round((time.monotonic() - started) * 1000)}
