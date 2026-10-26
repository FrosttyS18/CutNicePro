import { describe, expect, it } from "vitest";
import { moveSelectionToTrack } from "../lib/composition-arrange";
import { validateComposition } from "../lib/composition";
import { splitSelection } from "../lib/composition-edit";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { sourceVideoForAudio } from "../lib/composition-playback";
import { emptyWorkspace } from "../lib/workspace";

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 100, width: 1920, height: 1080, videoId: null, url: null };
  workspace.settings.trimStart = 10; workspace.settings.trimEnd = 12;
  workspace.transcript = [{ id: "cue", start: 10, end: 12, text: "Legenda" }];
  const initial = compositionFromLegacy(workspace);
  const document = splitSelection(initial, [initial.items[0].id], 30);
  document.tracks.push({ ...document.tracks[0], id: "V2", name: "Camada 2", primary: false });
  const video = document.items.find(item => item.kind === "video" && item.startFrame === 30)!;
  document.items.find(item => item.kind === "caption" && item.groupId === video.groupId)!.captionEdits.cue = "Correção local";
  return { document, video };
}

describe("vínculos de uma camada visual livre", () => {
  it.each([false, true])("sobrepõe o segundo bloco em zero sem o áudio ou legenda prenderem o visual ao fim, ímã %s", magnetic => {
    const { document, video } = fixture();
    const before = structuredClone(document);
    const next = moveSelectionToTrack(document, [video.id], 0, "V2", { magnetic, companionTrackIds: { A1: "A2", C1: "C2" } });
    expect(next.items.filter(item => item.groupId === video.groupId)).toEqual(document.items.filter(item => item.groupId === video.groupId)
      .map(item => ({ ...item, startFrame: 0, trackId: item.kind === "video" ? "V2" : item.kind === "audio" ? "A2" : "C2" })));
    expect(next.items.filter(item => item.groupId !== video.groupId)).toEqual(document.items.filter(item => item.groupId !== video.groupId));
    expect(next.items.map(item => item.id)).toEqual(document.items.map(item => item.id));
    expect(next.assets).toBe(document.assets);
    const audio = next.items.find(item => item.kind === "audio" && item.groupId === video.groupId)!;
    expect(sourceVideoForAudio(next, audio)?.id).toBe(video.id);
    expect(validateComposition(next)).toEqual([]);
    expect(document).toEqual(before);
  });

  it("move no próprio overlay usando faixas associadas existentes que estão livres no tempo escolhido", () => {
    const { document, video } = fixture();
    video.trackId = "V2";
    document.tracks.push({ ...document.tracks[1], id: "busy-audio", name: "Áudio ocupado" }, { ...document.tracks[1], id: "A2", name: "Áudio 2" }, { ...document.tracks[2], id: "C2", name: "Legendas 2" });
    document.items.push({ ...structuredClone(document.items.find(item => item.kind === "audio")!), id: "independent-music", trackId: "busy-audio", groupId: "music", followsMain: false });
    const next = moveSelectionToTrack(document, [video.id], 0, "V2", { magnetic: false, companionTrackIds: { A1: "unused-audio", C1: "unused-caption" } });
    expect(next.items.find(item => item.id === video.id)).toMatchObject({ startFrame: 0, trackId: "V2" });
    expect(next.items.find(item => item.kind === "audio" && item.groupId === video.groupId)?.trackId).toBe("A2");
    expect(next.items.find(item => item.kind === "caption" && item.groupId === video.groupId)?.trackId).toBe("C2");
    expect(next.tracks).toEqual(document.tracks);
  });

  it("mantém clamp de colisão visual e aloca acompanhantes sem criar outra faixa visual", () => {
    const { document, video } = fixture();
    document.items.push({ ...structuredClone(document.items[0]), id: "obstacle", trackId: "V2", groupId: "independent", followsMain: false, durationFrames: 15, sourceEndUs: 10_500_000 });
    const next = moveSelectionToTrack(document, [video.id], 0, "V2", { magnetic: false, companionTrackIds: { A1: "A2", C1: "C2" } });
    expect(next.items.filter(item => item.groupId === video.groupId).map(item => item.startFrame)).toEqual([15, 15, 15]);
    expect(next.tracks.filter(track => track.kind === "visual")).toEqual(document.tracks.filter(track => track.kind === "visual"));
    expect(next.items.find(item => item.id === "obstacle")).toEqual(document.items[document.items.length - 1]);
    expect(validateComposition(next)).toEqual([]);
  });

  it("não usa faixa bloqueada nem altera estados de mute/visibilidade ou elemento independente fixo", () => {
    const { document, video } = fixture();
    document.tracks.find(track => track.id === "A1")!.muted = true;
    document.tracks.find(track => track.id === "C1")!.hidden = true;
    document.tracks.push({ ...document.tracks[1], id: "locked-audio", locked: true }, { ...document.tracks[1], id: "audible-audio", muted: false });
    const fixed = { ...structuredClone(document.items.find(item => item.kind === "audio")!), id: "fixed", trackId: "audible-audio", groupId: video.groupId, followsMain: false };
    document.items.push(fixed);
    const next = moveSelectionToTrack(document, [video.id], 0, "V2", { magnetic: false, companionTrackIds: { A1: "A2", C1: "C2" } });
    expect(next.tracks.find(track => track.id === "A2")).toMatchObject({ muted: true, locked: false });
    expect(next.tracks.find(track => track.id === "C2")).toMatchObject({ hidden: true, locked: false });
    expect(next.items.find(item => item.id === fixed.id)).toEqual(fixed);
    document.tracks.find(track => track.id === "A1")!.locked = true;
    expect(() => moveSelectionToTrack(document, [video.id], 0, "V2", { magnetic: false })).toThrow(/bloqueada/);
  });

  it("mantém IDs de novas faixas associadas nos vinte previews do gesto e rejeita colisão de identidade", () => {
    const { document, video } = fixture();
    const options = { magnetic: false, companionTrackIds: { A1: "gesture-audio", C1: "gesture-caption" } };
    for (let index = 0; index < 20; index++) {
      const next = moveSelectionToTrack(document, [video.id], index, "V2", options);
      expect(next.items.find(item => item.kind === "audio" && item.groupId === video.groupId)?.trackId).toBe("gesture-audio");
      expect(next.items.find(item => item.kind === "caption" && item.groupId === video.groupId)?.trackId).toBe("gesture-caption");
      expect(next.items.map(item => item.id)).toEqual(document.items.map(item => item.id));
      expect(next.tracks).toHaveLength(document.tracks.length + 2);
    }
    expect(() => moveSelectionToTrack(document, [video.id], 0, "V2", { magnetic: false, companionTrackIds: { A1: "V1", C1: "C2" } })).toThrow(/existente/);
  });
});
