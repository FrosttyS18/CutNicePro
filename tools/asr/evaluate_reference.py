import json
import re
import subprocess
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / ".tooling/vendor/asr-refinement"
VIDEO = Path("C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/media/files/57fbe0fabed97558cd779579475e9e49e07c492d8d2d2a20603ccb4ccd6730ca.mp4")
REFERENCE = Path("C:/Users/adcka/Downloads/DAVY se REVOLTA e FICA MALUCO com JOGOS da EA!! #FGN.txt")


def words(text):
    text = "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9]+", text)


def prefix_distance(reference, hypothesis):
    previous = list(range(len(reference) + 1))
    for i, token in enumerate(hypothesis, 1):
        current = [i]
        for j, expected in enumerate(reference, 1):
            current.append(min(previous[j]+1, current[j-1]+1, previous[j-1]+(token != expected)))
        previous = current
    end = min(range(max(1,len(hypothesis)//2), min(len(reference),len(hypothesis)*2)+1), key=lambda j: previous[j])
    return {"edit_distance": previous[end], "reference_prefix_words": end, "hypothesis_words":len(hypothesis), "noisy_reference_wer": previous[end]/end}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    wav = OUTPUT / "first-hook-86s.wav"
    subprocess.run([str(ROOT / ".tooling/vendor/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe"), "-nostdin", "-v", "error", "-y", "-i", str(VIDEO), "-t", "86", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)], check=True)
    reference = words(REFERENCE.read_text(encoding="utf-8-sig"))[:650]
    variants = [("baseline", []), ("context", ["--prompt", "Conversa em português brasileiro, com pontuação natural, nomes próprios e linguagem coloquial."]), ("vocabulary", ["--prompt", "GTA. EA FC. Battlefield 6. Davy Jones. Fênix. Takeshi.", "--carry-initial-prompt"])]
    report = OUTPUT / "comparison.json"
    records = json.loads(report.read_text(encoding="utf-8")) if report.exists() else []
    for model in ["turbo", "large"]:
        filename = "ggml-large-v3-turbo.bin" if model == "turbo" else "ggml-large-v3.bin"
        for variant, flags in variants:
            if any(item["model"] == model and item["variant"] == variant for item in records):
                continue
            output = OUTPUT / f"{model}-{variant}"
            if output.with_suffix(".json").exists():
                invalid = output.with_suffix(".json").read_bytes().decode("utf-8",errors="replace")
                if "\ufffd" not in invalid:
                    raise RuntimeError(f"Existing valid result must not be overwritten: {output}")
                (OUTPUT / "failed-unicode-prompt.json").write_text(json.dumps({"model":model,"variant":variant,"status":"FAIL","reason":"Whisper Windows CLI writes ACP prompt bytes into UTF-8 result, including recognition tokens derived from the prompt."}),encoding="utf-8")
                output = OUTPUT / f"{model}-{variant}-ascii-retry"
                flags = [unicodedata.normalize("NFKD",item).encode("ascii","ignore").decode("ascii") for item in flags]
            command = [str(ROOT / ".tooling/vendor/whisper/gpu/Release/whisper-cli.exe"), "-m", str(ROOT / ".tooling/vendor/whisper/models" / filename), "-f", str(wav), "-l", "pt", "-nfa", "-dtw", "large.v3.turbo" if model == "turbo" else "large.v3", "-t", "8", "-pp", "-ojf", "-bs", "5", "-bo", "5", "-mc", "0" if variant == "baseline" else "224", "-sns", "-of", str(output), *flags]
            started = time.perf_counter()
            with output.with_suffix(".log").open("w", encoding="utf-8") as log:
                subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            result = json.loads(output.with_suffix(".json").read_bytes().decode("utf-8",errors="replace"))
            text = " ".join(segment["text"].strip() for segment in result["transcription"])
            if "\ufffd" in text:
                raise RuntimeError("Invalid UTF-8 in recognition output; do not use this result")
            normalized = " ".join(words(text))
            record = {"model":model,"variant":variant,"audio_seconds":86,"wall_seconds":round(time.perf_counter()-started,3),"text":text,
                **prefix_distance(reference,words(text)),
                "confirmed_anchors":{"opening_exact":"bom galera antes da gente entrar no gta" in normalized,"ea_fc":bool(re.search(r"\bea\s*fc\b",normalized)),"desgraca":bool(re.search(r"\bessa desgraca\b",normalized))},
                "command":command,"metadata_utf8_replacement":"\ufffd" in json.dumps(result,ensure_ascii=False)}
            records.append(record)
            (OUTPUT / "comparison.json").write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding="utf-8")
            print(json.dumps({k:v for k,v in record.items() if k not in ["text","command"]}),flush=True)


if __name__ == "__main__":
    main()
