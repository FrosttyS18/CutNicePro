import type { MediaKind } from "./composition-types";

export const MEDIA_FILE_EXTENSIONS: Record<MediaKind, string[]> = {
  video: ["mp4", "m4v", "mov", "webm", "mkv", "avi"],
  image: ["png", "jpg", "jpeg", "webp"],
  audio: ["wav", "mp3", "m4a", "aac", "ogg", "opus", "flac"],
};
