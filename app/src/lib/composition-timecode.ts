import { frameToSeconds, secondsToFrame } from "./composition-time";
import type { FrameRate } from "./composition-types";

export function formatCompositionTimecode(frame: number, fps: FrameRate): string {
  const total = Math.round(frameToSeconds(frame, fps) * 1000);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const seconds = Math.floor(total / 1000) % 60;
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${hours ? `${pad(hours)}:` : ""}${pad(minutes)}:${pad(seconds)}.${pad(total % 1000, 3)}`;
}

function parseMilliseconds(value: string): number {
  const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) throw new Error("Use o formato 00:00.000 ou 00:00:00.000 para início e fim.");
  const total = Number(match[1] ?? 0) * 3_600_000 + Number(match[2]) * 60_000 + Number(match[3]) * 1000 + Number((match[4] ?? "").padEnd(3, "0"));
  if (!Number.isSafeInteger(total)) throw new Error("Tempo fora do formato permitido. Informe um intervalo menor.");
  return total;
}

export function parseCompositionRange(start: string, end: string, duration: number, fps: FrameRate): { start: number; end: number } {
  const from = parseMilliseconds(start);
  const to = parseMilliseconds(end);
  if (to <= from) throw new Error("O fim precisa ser posterior ao início.");
  if (to > Math.round(frameToSeconds(duration, fps) * 1000)) throw new Error(`O fim deve estar dentro da montagem, até ${formatCompositionTimecode(duration, fps)}.`);
  const first = secondsToFrame(from / 1000, fps);
  const last = secondsToFrame(to / 1000, fps);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 0 || last > duration || last <= first) throw new Error("Escolha um intervalo com pelo menos um quadro da montagem.");
  return { start: first, end: last };
}
