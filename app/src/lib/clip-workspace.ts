import type { Clip } from "./clips";
import { isolatedClipSettings } from "./clips";
import type { WorkspaceData } from "./workspace-types";
import { defaultEditorSettings } from "./workspace";

export function openClipWorkspace(data: WorkspaceData, clip: Clip): WorkspaceData {
  const edits = { ...data.clipEdits };
  if (data.activeClipId) edits[data.activeClipId] = data.settings;
  return { ...data, tool: "editor", videoSettings: data.activeClipId ? data.videoSettings : data.settings,
    clipEdits: edits, activeClipId: clip.id, settings: isolatedClipSettings(clip,edits[clip.id],data.media) };
}

export function fullVideoWorkspace(data: WorkspaceData): WorkspaceData {
  if (!data.activeClipId) return data;
  return { ...data, activeClipId: undefined, clipEdits: { ...data.clipEdits, [data.activeClipId]: data.settings },
    settings: data.videoSettings ?? { ...defaultEditorSettings(), trimEnd: data.media?.duration ?? null } };
}

export function captureClipEdits(data: WorkspaceData): WorkspaceData {
  return data.activeClipId ? { ...data, clipEdits: { ...data.clipEdits,[data.activeClipId]: data.settings } } : data;
}
