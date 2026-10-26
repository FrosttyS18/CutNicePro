import type { FrameRate } from "./composition-types";

export function fpsFromRate(rate = 30): FrameRate {
  if (!Number.isFinite(rate) || rate <= 0) return { numerator: 30, denominator: 1 };
  const limited = Math.min(60, rate);
  for (const numerator of [24000, 30000, 60000]) {
    if (Math.abs(limited - numerator / 1001) < 0.001) return { numerator, denominator: 1001 };
  }
  if (Number.isInteger(limited)) return { numerator: limited, denominator: 1 };
  return { numerator: Math.round(limited * 1000), denominator: 1000 };
}
export function frameToSeconds(frame: number, fps: FrameRate): number {
  return frame * fps.denominator / fps.numerator;
}
export function secondsToFrame(seconds: number, fps: FrameRate): number {
  return Math.round(seconds * fps.numerator / fps.denominator);
}
export function frameToUs(frame: number, fps: FrameRate): number {
  return Math.round(frameToSeconds(frame, fps) * 1_000_000);
}
export function usToFrame(us: number, fps: FrameRate): number {
  return secondsToFrame(us / 1_000_000, fps);
}
