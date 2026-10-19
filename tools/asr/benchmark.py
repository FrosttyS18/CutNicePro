import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / ".tooling/vendor/asr-evaluation"
os.environ["HF_HOME"] = str(OUTPUT / "huggingface")
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["TORCH_HOME"] = str(OUTPUT / "torch")
os.environ["NUMBA_CACHE_DIR"] = str(OUTPUT / "numba")
os.environ["PYTHONUTF8"] = "1"


def worker(engine, device):
    import torch
    torch.set_num_threads(8)
    audio = str(OUTPUT / "davy-30s.wav")
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable")
    if engine == "qwen":
        from huggingface_hub import snapshot_download
        from qwen_asr import Qwen3ASRModel
        model_path = snapshot_download("Qwen/Qwen3-ASR-1.7B")
        started = time.perf_counter()
        model = Qwen3ASRModel.from_pretrained(model_path, dtype=torch.bfloat16 if device == "cuda" else torch.float32,
            device_map="cuda:0" if device == "cuda" else "cpu", max_inference_batch_size=1, max_new_tokens=1024)
        loaded = time.perf_counter()
        result = model.transcribe(audio=audio, language="Portuguese")
        text = result[0].text
        segments = []
    else:
        dll = Path(torch.__file__).parent / "lib"
        os.environ["PATH"] = str(dll) + os.pathsep + os.environ.get("PATH", "")
        handle = os.add_dll_directory(str(dll)) if os.name == "nt" else None
        from faster_whisper import WhisperModel, download_model
        model_path = download_model("large-v3-turbo" if engine == "turbo" else "large-v3")
        started = time.perf_counter()
        model = WhisperModel(model_path, device=device, compute_type="float16" if device == "cuda" else "int8", cpu_threads=8, num_workers=1)
        loaded = time.perf_counter()
        import soundfile
        samples, _ = soundfile.read(audio, dtype="float32")
        generated, _ = model.transcribe(samples, language="pt", beam_size=5, condition_on_previous_text=False, word_timestamps=True, vad_filter=False)
        segments = [{"start": item.start, "end": item.end, "text": item.text,
            "words": [{"text": word.word, "start": word.start, "end": word.end} for word in item.words or []]} for item in generated]
        text = " ".join(item["text"].strip() for item in segments)
    finished = time.perf_counter()
    record = {"engine": engine, "device": device, "audio_seconds": 30, "load_seconds": loaded-started,
        "inference_seconds": finished-loaded, "total_seconds": finished-started, "text": text, "segments": segments,
        "torch": torch.__version__, "cuda": torch.version.cuda,
        "gpu": torch.cuda.get_device_name(0) if device == "cuda" else None,
        "torch_peak_allocated_mb": torch.cuda.max_memory_allocated()/1048576 if device == "cuda" else None}
    (OUTPUT / f"{engine}-{device}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in record.items() if key not in ["segments", "text"]}), flush=True)


def monitor(command, name):
    import psutil
    log = OUTPUT / f"{name}.log"
    started = time.perf_counter()
    peak_ram = 0
    peak_gpu = 0
    with log.open("w", encoding="utf-8") as stream:
        process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        target = psutil.Process(process.pid)
        while process.poll() is None:
            try:
                family = [target] + target.children(recursive=True)
                peak_ram = max(peak_ram, sum(item.memory_info().rss for item in family if item.is_running()))
                query = subprocess.run(["C:/Windows/System32/nvidia-smi.exe", "--query-gpu=memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
                if query.returncode == 0:
                    peak_gpu = max(peak_gpu, int(query.stdout.strip().splitlines()[0]))
            except (psutil.Error, ValueError):
                pass
            time.sleep(.5)
    result = {"name": name, "exit_code": process.returncode, "process_seconds_including_download": time.perf_counter()-started,
        "peak_process_tree_ram_mb": round(peak_ram/1048576), "peak_total_gpu_used_mb": peak_gpu,
        "gpu_memory_scope": "whole device including other applications", "log": str(log)}
    (OUTPUT / f"{name}-resources.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--engine", choices=["turbo", "large", "qwen", "parakeet", "native-turbo", "native-large"], required=True)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if args.worker:
        worker(args.engine, args.device)
    elif args.engine == "parakeet":
        binary = OUTPUT / "whisper-cuda/Release/parakeet-cli.exe" if args.device == "cuda" else ROOT / ".tooling/vendor/whisper/bin/Release/parakeet-cli.exe"
        monitor([str(binary), "-m", str(OUTPUT / "ggml-parakeet-v3-f16.bin"),
            "-f", str(OUTPUT / "davy-30s.wav"), *([] if args.device == "cuda" else ["-ng"]), "-t", "8", "-ps", "-otxt", "-of", str(OUTPUT / f"parakeet-{args.device}")], f"parakeet-{args.device}")
    elif args.engine.startswith("native-"):
        model = "large-v3" if args.engine == "native-large" else "large-v3-turbo"
        binary = OUTPUT / "whisper-cuda/Release/whisper-cli.exe" if args.device == "cuda" else ROOT / ".tooling/vendor/whisper/bin/Release/whisper-cli.exe"
        monitor([str(binary), "-m", str(ROOT / f".tooling/vendor/whisper/models/ggml-{model}.bin"), "-f", str(OUTPUT / "davy-30s.wav"),
            "-l", "pt", *([] if args.device == "cuda" else ["-ng"]), "-nfa", "-dtw", model.replace("-", "."), "-t", "8", "-pp", "-ojf", "-bs", "5", "-bo", "5", "-mc", "0", "-sns", "-of", str(OUTPUT / f"{args.engine}-{args.device}")], f"{args.engine}-{args.device}")
    else:
        monitor([sys.executable, str(Path(__file__).resolve()), "--worker", "--engine", args.engine, "--device", args.device], f"{args.engine}-{args.device}")
