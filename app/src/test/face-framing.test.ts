import { describe, expect, it } from "vitest";
import { isolatedClipSettings, parseClips, renderSettings, type Clip } from "../lib/clips";
import { defaultEditorSettings } from "../lib/workspace";

const clip: Clip = { id: "a".repeat(64), start: 10, end: 40, title: "Uma explicação completa", score: 80,
  reasons: [], review: "pending", format: "9:16", fit: "cover",
  faceFraming: { status: "stable", samples: 6, x: 0.79, y: 0.5, confidence: 0.9 } };

describe("enquadramento por rosto independente do LLM", () => {
  it("usa a mesma âncora na prévia e no payload de exportação", () => {
    const settings = isolatedClipSettings(clip);
    expect(settings.focalPoint).toEqual({ x: 79, y: 50 });
    expect(renderSettings(settings).focalPoint).toEqual(settings.focalPoint);
    expect(settings.trimStart).toBe(10);
  });
  it("respeita a edição manual salva", () => {
    const manual = { ...defaultEditorSettings(), focalPoint: { x: 12, y: 34 }, fit: "contain" as const };
    expect(isolatedClipSettings(clip, manual).focalPoint).toEqual(manual.focalPoint);
    expect(isolatedClipSettings(clip, manual).fit).toBe("contain");
  });
  it("mantém quadro amplo na ambiguidade e preserva a escolha sem rostos", () => {
    expect(isolatedClipSettings({ ...clip, faceFraming: { status: "ambiguous", samples: 8 } }).fit).toBe("contain");
    expect(isolatedClipSettings({ ...clip, faceFraming: { status: "noFaces", samples: 8 } }).fit).toBe("cover");
    expect(isolatedClipSettings({ ...clip, faceFraming: undefined }).fit).toBe("cover");
  });
  it("valida metadados sem quebrar clipes legados", () => {
    const collection = { version: 1, mediaId: "m", transcriptHash: "h", clips: [clip] };
    expect(parseClips(collection).clips[0].faceFraming?.samples).toBe(6);
    expect(() => parseClips({ ...collection, clips: [{ ...clip, faceFraming: { ...clip.faceFraming, x: 4 } }] })).toThrow();
    expect(() => parseClips({ ...collection, clips: [{ ...clip, faceFraming: null }] })).toThrow();
    expect(parseClips({ ...collection, clips: [{ ...clip, faceFraming: undefined }] }).clips).toHaveLength(1);
  });
});
