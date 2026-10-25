import argparse
import json
import math
import statistics
import time
from pathlib import Path


def offsets(start, end):
    count = max(3, min(12, math.ceil((end - start) / 2.5)))
    margin = min(0.5, (end - start) / 4)
    return [start + margin + (end - start - 2 * margin) * i / (count - 1)
            for i in range(count)]


def crop_position(center, fraction):
    if fraction >= 1:
        return 0.5
    return max(0.0, min(1.0, (center - fraction / 2) / (1 - fraction)))


def peak_working_set():
    import os
    if os.name != "nt":
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
    import ctypes
    from ctypes import wintypes
    class Counters(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("pageFaults", wintypes.DWORD),
                    *[(name, ctypes.c_size_t) for name in ("peak", "working", "quotaPeakPaged", "quotaPaged",
                                                          "quotaPeakNonPaged", "quotaNonPaged", "pagefile", "peakPagefile")]]
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    current = ctypes.windll.kernel32.GetCurrentProcess
    current.restype = ctypes.c_void_p
    read = ctypes.windll.psapi.GetProcessMemoryInfo
    read.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), wintypes.DWORD]
    if not read(current(), ctypes.byref(counters), counters.cb):
        raise OSError("Não foi possível medir a memória do detector")
    return counters.peak


def choose_face(faces, grey, following, width, height):
    import numpy as np
    usable = [f for f in faces if f[2] >= width * 0.035 and f[14] >= 0.6]
    if not usable:
        return None
    measured = []
    for face in usable:
        left = max(0, int(min(face[10], face[12]) - face[2] * 0.1))
        right = min(width, int(max(face[10], face[12]) + face[2] * 0.1))
        top = max(0, int(min(face[11], face[13]) - face[3] * 0.12))
        bottom = min(height, int(max(face[11], face[13]) + face[3] * 0.2))
        motion = 0.0
        if following is not None and bottom > top and right > left:
            motion = float(np.abs(grey[top:bottom, left:right].astype(np.int16)
                                  - following[top:bottom, left:right].astype(np.int16)).mean())
        measured.append((motion, face))
    motion, face = max(measured, key=lambda item: item[0])
    if motion < 4:
        ordered = sorted(usable, key=lambda f: f[2] * f[3], reverse=True)
        if len(ordered) > 1 and ordered[1][2] * ordered[1][3] >= ordered[0][2] * ordered[0][3] * 0.65:
            return {"ambiguous": True}
        face = ordered[0]
    return {"cx": float((face[0] + face[2] / 2) / width),
            "width": float(face[2] / width), "confidence": float(face[14]),
            "ambiguous": False}


def summarize(samples, fraction):
    found = [s for s in samples if s is not None and not s.get("ambiguous")]
    ambiguous = any(s is not None and s.get("ambiguous") for s in samples)
    if not found:
        return {"status": "ambiguous" if ambiguous else "noFaces", "samples": len(samples)}
    centers = [s["cx"] for s in found]
    center = statistics.median(centers)
    position = crop_position(center, fraction)
    crop_left = (1 - fraction) * position
    safe = (not ambiguous and len(found) * 3 >= len(samples) * 2
            and all(s["cx"] - s["width"] * 0.65 >= crop_left
                    and s["cx"] + s["width"] * 0.65 <= crop_left + fraction for s in found))
    if not safe:
        return {"status": "ambiguous", "samples": len(samples)}
    return {"status": "stable", "x": position, "y": 0.5,
            "confidence": min(s["confidence"] for s in found), "samples": len(samples)}


def validate_request(request):
    if request.get("version") != 1 or not isinstance(request.get("clips"), list) or len(request["clips"]) > 16:
        raise ValueError("Pedido de enquadramento inválido")


def analyze(request):
    validate_request(request)
    import cv2
    cv2.setNumThreads(1)
    cv2.ocl.setUseOpenCL(False)
    source, model = Path(request["source"]), Path(request["model"])
    if not source.is_file() or not model.is_file():
        raise ValueError("Arquivo local indisponível")
    capture = cv2.VideoCapture(str(source), cv2.CAP_FFMPEG, [
        cv2.CAP_PROP_N_THREADS, 1, cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000,
        cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000])
    if not capture.isOpened():
        raise ValueError("Não foi possível ler o vídeo para enquadramento")
    started = time.monotonic()
    results = []
    detector = cv2.FaceDetectorYN.create(str(model), "", (480, 320), 0.6, 0.3, 50)
    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        if not math.isfinite(fps) or fps <= 0:
            raise ValueError("Taxa de quadros inválida")
        for clip in request["clips"]:
            start, end = float(clip["start"]), float(clip["end"])
            if not all(math.isfinite(v) for v in (start, end)) or start < 0 or not 0.05 <= end - start <= 180.01:
                raise ValueError("Intervalo inválido")
            samples = []
            fraction = 1.0
            for at in offsets(start, end):
                if time.monotonic() - started > 120:
                    raise TimeoutError("Enquadramento excedeu o limite local de 120 segundos")
                capture.set(cv2.CAP_PROP_POS_MSEC, at * 1000)
                ok, frame = capture.read()
                if not ok:
                    samples.append(None)
                    continue
                original_h, original_w = frame.shape[:2]
                out_w, out_h = map(int, clip["ratio"].split(":"))
                scale = max(out_w / original_w, out_h / original_h)
                fraction = min(1.0, out_w / (original_w * scale))
                height = max(2, round(original_h * 480 / original_w))
                frame = cv2.resize(frame, (480, height))
                following = None
                for _ in range(max(1, round(fps * 0.25))):
                    ok, following = capture.read()
                    if not ok:
                        following = None
                        break
                detector.setInputSize((480, height))
                _, faces = detector.detect(frame)
                grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                grey_next = (cv2.cvtColor(cv2.resize(following, (480, height)), cv2.COLOR_BGR2GRAY)
                             if following is not None else None)
                samples.append(choose_face(faces if faces is not None else [], grey, grey_next, 480, height))
            results.append({"id": clip["id"], **summarize(samples, fraction)})
        return {"version": 1, "backend": "yunet-mouth-motion-static-v1", "items": results,
                "elapsedMs": round((time.monotonic() - started) * 1000),
                "peakWorkingSetBytes": peak_working_set()}
    finally:
        capture.release()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    request = json.loads(args.request.read_text(encoding="utf-8-sig"))
    args.output.write_text(json.dumps(analyze(request), ensure_ascii=False, allow_nan=False), encoding="utf-8")


if __name__ == "__main__":
    main()
