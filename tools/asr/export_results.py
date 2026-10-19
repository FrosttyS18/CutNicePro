import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
BENCH = ROOT / ".tooling/vendor/asr-evaluation"
RESULT = ROOT / "docs/reports/evidence/2026-10-19-asr-comparison.json"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def native(name, filename=None):
    log_path = BENCH / f"{name}.log"
    log = log_path.read_text(encoding="utf-8-sig", errors="replace")
    timing = {key: float(value)/1000 for key, value in re.findall(r"(?:whisper|parakeet)_print_timings:\s+(load|encode|decode|predict|batchd|total) time\s*=\s*([\d.]+) ms", log)}
    record = {"name":name, "backend":"ggml b5454", "audio_seconds":30, "timing_seconds":timing, "log_sha256":digest(log_path)}
    resource = BENCH / f"{name}-resources.json"
    if resource.exists():
        record["resources"] = {key:value for key,value in json.loads(resource.read_text()).items() if key != "log"}
    source = BENCH / f"{filename or name}.json"
    if source.exists():
        output = json.loads(source.read_text(encoding="utf-8-sig"))
        record["text"] = " ".join(segment["text"].strip() for segment in output["transcription"])
        record["dtw_tokens"] = sum(token.get("t_dtw", -1) >= 0 for segment in output["transcription"] for token in segment.get("tokens", []))
        record["word_alignment_contract"] = "PASS: Rust canonical parser and later word timestamps" if name != "native-turbo-cpu" else "not separately checked by Rust integration test"
    else:
        record["text"] = (BENCH / f"{name}.txt").read_text(encoding="utf-8-sig").strip()
        record["word_alignment_contract"] = "TDT token times logged; application adapter not implemented"
    return record


if __name__ == "__main__":
    rows = [native(name) for name in ["parakeet-cpu", "parakeet-cuda", "native-turbo-cpu", "native-turbo-cuda", "native-large-cuda"]]
    rows.append(native("large-native-cpu"))
    for name in ["turbo-cpu", "turbo-cuda", "large-cuda", "qwen-cuda"]:
        value = json.loads((BENCH / f"{name}.json").read_text(encoding="utf-8"))
        value["backend"] = "qwen-asr 0.0.6 / Transformers 4.57.6" if name.startswith("qwen") else "faster-whisper 1.2.1 / CTranslate2 4.8.3"
        value["word_count"] = sum(len(segment["words"]) for segment in value.pop("segments"))
        value["resources"] = {key:record for key,record in json.loads((BENCH / f"{name}-resources.json").read_text()).items() if key != "log"}
        rows.append(value)
    result = {"date":"2026-10-19", "sample":{"duration_seconds":30,"format":"16 kHz mono PCM", "sha256":digest(BENCH / "davy-30s.wav")},
        "hardware":{"gpu":"NVIDIA GeForce RTX 5070", "vram_total_mib":12227,"vram_free_first_observation_mib":4913,"driver":"610.88","cpu_threads_per_job":8},
        "method":"Sequential runs, one process/model at a time. Single run per case; first-run loading and kernel compilation affect totals. Whole-device GPU memory includes other applications. No human reference transcript; WER/CER not computed.",
        "corrected_initial_failures":["Two faster-whisper runs failed before decoding because PyAV 19 rejected metadata_errors. Replaced file decoding with soundfile float32 PCM; repeated only those two cases."],
        "results":rows}
    RESULT.parent.mkdir(parents=True, exist_ok=True)
    RESULT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"{len(rows)} successful cases exported to {RESULT}")
