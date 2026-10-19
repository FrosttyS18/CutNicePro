export const SPLASH_DURATION = 3;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function splashFrame(time: number) {
  const progress = clamp((time - 0.65) / 1.85);
  const glide = progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2;
  const reveal = 1 - (1 - progress) ** 3;
  const markX = 217.1235 * (1 - glide);

  return {
    markX,
    markOpacity: clamp(time / 0.45),
    wordX: -442.247 * (1 - reveal),
    clipX: 66.267 + markX,
    frameOpacity: clamp((time - 2) / 0.5),
  };
}
