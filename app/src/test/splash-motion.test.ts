import { describe, expect, it } from "vitest";
import { SPLASH_DURATION, splashFrame } from "../components/splash/splash-motion";

describe("formação do logo do splash", () => {
  it("começa com C centralizado e o restante atrás da máscara", () => {
    const value = splashFrame(0);
    expect(value.markX).toBe(217.1235);
    expect(value.markOpacity).toBe(0);
    expect(500.514 + value.wordX).toBeLessThan(value.clipX);
  });

  it("revela o nome enquanto C desliza para seu lugar", () => {
    const before = splashFrame(0.7);
    const after = splashFrame(1.8);
    expect(after.markX).toBeLessThan(before.markX);
    expect(after.wordX).toBeGreaterThan(before.wordX);
    expect(after.clipX).toBeLessThan(before.clipX);
  });

  it("termina na geometria original, sem transparência ou deslocamento", () => {
    expect(splashFrame(SPLASH_DURATION)).toEqual({
      markX: 0, markOpacity: 1, wordX: -0, clipX: 66.267, frameOpacity: 1,
    });
  });

  it("mantém C sozinho no início e reserva meio segundo para o logo completo", () => {
    expect(SPLASH_DURATION).toBe(3);
    const opening = splashFrame(0.6);
    expect(opening.markOpacity).toBe(1);
    expect(opening.markX).toBe(splashFrame(0).markX);
    expect(500.514 + opening.wordX).toBeLessThan(opening.clipX);
    expect(splashFrame(2.5)).toEqual(splashFrame(SPLASH_DURATION));
  });
});
