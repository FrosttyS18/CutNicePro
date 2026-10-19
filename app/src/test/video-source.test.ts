import { describe, expect, it } from "vitest";
import { validateVideoFile, youtubeVideoId } from "../lib/video-source";

describe("validação de mídia local", () => {
  it.each(["MP4", "mov", "webm", "mkv", "m4v", "avi"])("aceita contêiner %s para inspeção real", (extension) => {
    expect(validateVideoFile({ name: `vídeo.${extension}`, size: 1024, type: "" })).toBeNull();
  });
  it("recusa arquivo vazio", () => {
    expect(validateVideoFile({ name: "video.mp4", size: 0, type: "video/mp4" })).toContain("vazio");
  });
  it("recusa extensões e MIME incompatíveis", () => {
    expect(validateVideoFile({ name: "video.exe", size: 1, type: "video/mp4" })).not.toBeNull();
    expect(validateVideoFile({ name: "video.mp4", size: 1, type: "text/plain" })).not.toBeNull();
  });
});

describe("links do YouTube", () => {
  it.each([
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://youtu.be/abcdefghijk?t=30",
    "https://youtube.com/shorts/abcdefghijk",
    "https://m.youtube.com/live/abcdefghijk",
  ])("reconhece vídeo em %s", (url) => expect(youtubeVideoId(url)).toBe("abcdefghijk"));
  it.each([
    "https://youtube.com.evil.test/watch?v=abcdefghijk", "https://youtube.com@evil.test/abcdefghijk",
    "javascript:alert(1)", "file:///video.mp4", "http://youtube.com/watch?v=abcdefghijk",
    "https://youtube.com/watch?v=curto", "https://youtu.be/abcdefghijk/extra", "não é um link",
  ])("recusa %s", (url) => expect(youtubeVideoId(url)).toBeNull());
});
